
-- =========================================================
-- P6: Reconciliation Module
-- =========================================================

CREATE TABLE IF NOT EXISTS public.platform_reconciliation_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('scan', 'fix')),
  validator text,
  severity text CHECK (severity IN ('critical','high','medium','low','info')),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  entity_type text,
  entity_id text,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_log_created_at ON public.platform_reconciliation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_log_kind ON public.platform_reconciliation_log(kind);
CREATE INDEX IF NOT EXISTS idx_recon_log_workspace ON public.platform_reconciliation_log(workspace_id);

ALTER TABLE public.platform_reconciliation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read recon log" ON public.platform_reconciliation_log;
CREATE POLICY "Admins read recon log"
  ON public.platform_reconciliation_log FOR SELECT
  TO authenticated
  USING (
    has_platform_role(auth.uid(), 'platform_owner'::platform_admin_role)
    OR has_platform_role(auth.uid(), 'finance_admin'::platform_admin_role)
    OR has_platform_role(auth.uid(), 'security_admin'::platform_admin_role)
  );

DROP POLICY IF EXISTS "no direct insert recon log" ON public.platform_reconciliation_log;
CREATE POLICY "no direct insert recon log"
  ON public.platform_reconciliation_log FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------
-- Scan: returns array of divergences (does not write to DB)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_reconciliation_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
  v_results jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_counts jsonb;
BEGIN
  IF NOT (
    has_platform_role(v_caller, 'platform_owner'::platform_admin_role)
    OR has_platform_role(v_caller, 'finance_admin'::platform_admin_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_caller;

  -- 1) Active subscription past current_period_end without an open/paid invoice
  WITH v1 AS (
    SELECT
      'subscription_missing_invoice' AS validator,
      'high' AS severity,
      s.workspace_id,
      'workspace_subscription' AS entity_type,
      s.id::text AS entity_id,
      jsonb_build_object(
        'subscription_id', s.id,
        'status', s.status,
        'current_period_end', s.current_period_end,
        'workspace_name', w.name
      ) AS details
    FROM workspace_subscriptions s
    JOIN workspaces w ON w.id = s.workspace_id
    WHERE s.status = 'active'
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end < (now() - interval '2 days')
      AND NOT EXISTS (
        SELECT 1 FROM workspace_invoices i
        WHERE i.subscription_id = s.id
          AND i.created_at >= s.current_period_end - interval '7 days'
      )
  )
  SELECT v_results || COALESCE(jsonb_agg(to_jsonb(v1)), '[]'::jsonb) INTO v_results FROM v1;

  -- 2) Paid invoice with subscription still in past_due
  WITH v2 AS (
    SELECT
      'paid_invoice_past_due_sub' AS validator,
      'critical' AS severity,
      i.workspace_id,
      'workspace_invoice' AS entity_type,
      i.id::text AS entity_id,
      jsonb_build_object(
        'invoice_id', i.id,
        'subscription_id', i.subscription_id,
        'invoice_status', i.status,
        'subscription_status', s.status,
        'paid_at', i.paid_at,
        'workspace_name', w.name
      ) AS details
    FROM workspace_invoices i
    JOIN workspace_subscriptions s ON s.id = i.subscription_id
    JOIN workspaces w ON w.id = i.workspace_id
    WHERE i.status = 'paid'
      AND s.status = 'past_due'
      AND i.paid_at >= s.updated_at - interval '7 days'
  )
  SELECT v_results || COALESCE(jsonb_agg(to_jsonb(v2)), '[]'::jsonb) INTO v_results FROM v2;

  -- 3) Open dunning case whose invoice is already paid
  WITH v3 AS (
    SELECT
      'dunning_open_invoice_paid' AS validator,
      'critical' AS severity,
      d.workspace_id,
      'billing_dunning_case' AS entity_type,
      d.id::text AS entity_id,
      jsonb_build_object(
        'dunning_id', d.id,
        'invoice_id', d.invoice_id,
        'invoice_status', i.status,
        'paid_at', i.paid_at,
        'workspace_name', w.name
      ) AS details
    FROM billing_dunning_cases d
    JOIN workspace_invoices i ON i.id = d.invoice_id
    JOIN workspaces w ON w.id = d.workspace_id
    WHERE d.status IN ('open','retrying')
      AND i.status = 'paid'
  )
  SELECT v_results || COALESCE(jsonb_agg(to_jsonb(v3)), '[]'::jsonb) INTO v_results FROM v3;

  -- 4a) Duplicate provider events
  WITH v4a AS (
    SELECT
      'duplicate_billing_event' AS validator,
      'medium' AS severity,
      MAX(workspace_id) AS workspace_id,
      'billing_event' AS entity_type,
      provider_event_id AS entity_id,
      jsonb_build_object(
        'provider_event_id', provider_event_id,
        'count', COUNT(*),
        'event_type', MAX(event_type)
      ) AS details
    FROM billing_events
    WHERE provider_event_id IS NOT NULL
    GROUP BY provider_event_id
    HAVING COUNT(*) > 1
  )
  SELECT v_results || COALESCE(jsonb_agg(to_jsonb(v4a)), '[]'::jsonb) INTO v_results FROM v4a;

  -- 4b) Unprocessed billing events older than 1h
  WITH v4b AS (
    SELECT
      'unprocessed_billing_event' AS validator,
      'high' AS severity,
      e.workspace_id,
      'billing_event' AS entity_type,
      e.id::text AS entity_id,
      jsonb_build_object(
        'event_id', e.id,
        'event_type', e.event_type,
        'created_at', e.created_at,
        'error_message', e.error_message
      ) AS details
    FROM billing_events e
    WHERE e.processed = false
      AND e.created_at < now() - interval '1 hour'
  )
  SELECT v_results || COALESCE(jsonb_agg(to_jsonb(v4b)), '[]'::jsonb) INTO v_results FROM v4b;

  v_counts := jsonb_build_object(
    'critical', (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'severity' = 'critical'),
    'high',     (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'severity' = 'high'),
    'medium',   (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'severity' = 'medium'),
    'low',      (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'severity' = 'low'),
    'total',    jsonb_array_length(v_results)
  );

  v_summary := jsonb_build_object(
    'scanned_at', now(),
    'counts', v_counts,
    'divergences', v_results
  );

  -- Log the scan summary (counts only, no per-row spam)
  INSERT INTO platform_reconciliation_log
    (kind, validator, severity, before_snapshot, after_snapshot, details, actor_user_id, actor_email, reason)
  VALUES
    ('scan', 'all_validators', 'info', '{}'::jsonb, '{}'::jsonb, v_counts, v_caller, v_email, 'manual scan');

  RETURN v_summary;
END;
$$;

-- ---------------------------------------------------------
-- Fix: applies idempotent correction for one divergence
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_reconciliation_fix(
  _validator text,
  _entity_type text,
  _entity_id text,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_workspace uuid;
  v_severity text := 'info';
  v_action text;
BEGIN
  IF NOT (
    has_platform_role(v_caller, 'platform_owner'::platform_admin_role)
    OR has_platform_role(v_caller, 'finance_admin'::platform_admin_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 4 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_caller;

  IF _validator = 'dunning_open_invoice_paid' AND _entity_type = 'billing_dunning_case' THEN
    SELECT to_jsonb(d.*), d.workspace_id INTO v_before, v_workspace
    FROM billing_dunning_cases d WHERE d.id = _entity_id::uuid;

    IF v_before IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

    -- Idempotent: only act if still open
    IF v_before->>'status' IN ('open','retrying') THEN
      UPDATE billing_dunning_cases
        SET status = 'recovered',
            closed_at = now(),
            metadata = COALESCE(metadata,'{}'::jsonb)
              || jsonb_build_object('reconciled_by', v_caller, 'reconciled_reason', _reason)
        WHERE id = _entity_id::uuid;
      v_action := 'closed_as_recovered';
    ELSE
      v_action := 'noop_already_closed';
    END IF;

    SELECT to_jsonb(d.*) INTO v_after FROM billing_dunning_cases d WHERE d.id = _entity_id::uuid;
    v_severity := 'critical';

  ELSIF _validator = 'paid_invoice_past_due_sub' AND _entity_type = 'workspace_invoice' THEN
    DECLARE v_sub_id uuid; v_sub_before jsonb;
    BEGIN
      SELECT subscription_id, workspace_id INTO v_sub_id, v_workspace
      FROM workspace_invoices WHERE id = _entity_id::uuid;
      IF v_sub_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

      SELECT to_jsonb(s.*) INTO v_sub_before FROM workspace_subscriptions s WHERE s.id = v_sub_id;
      v_before := jsonb_build_object('subscription', v_sub_before);

      IF v_sub_before->>'status' = 'past_due' THEN
        UPDATE workspace_subscriptions
          SET status = 'active',
              metadata = COALESCE(metadata,'{}'::jsonb)
                || jsonb_build_object('reconciled_by', v_caller, 'reconciled_reason', _reason)
          WHERE id = v_sub_id;
        v_action := 'set_subscription_active';
      ELSE
        v_action := 'noop_subscription_not_past_due';
      END IF;

      v_after := jsonb_build_object(
        'subscription', (SELECT to_jsonb(s.*) FROM workspace_subscriptions s WHERE s.id = v_sub_id)
      );
      v_severity := 'critical';
    END;

  ELSIF _validator = 'unprocessed_billing_event' AND _entity_type = 'billing_event' THEN
    SELECT to_jsonb(e.*), e.workspace_id INTO v_before, v_workspace
    FROM billing_events e WHERE e.id = _entity_id::uuid;
    IF v_before IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

    IF (v_before->>'processed')::boolean = false THEN
      UPDATE billing_events
        SET processed = true,
            processed_at = now(),
            error_message = COALESCE(error_message,'') || ' [reconciled: ' || _reason || ']'
        WHERE id = _entity_id::uuid;
      v_action := 'marked_processed';
    ELSE
      v_action := 'noop_already_processed';
    END IF;
    SELECT to_jsonb(e.*) INTO v_after FROM billing_events e WHERE e.id = _entity_id::uuid;
    v_severity := 'high';

  ELSIF _validator = 'duplicate_billing_event' AND _entity_type = 'billing_event' THEN
    -- Keep the earliest, mark later duplicates as processed (with note)
    DECLARE v_keeper uuid; v_dups int := 0;
    BEGIN
      SELECT id INTO v_keeper
        FROM billing_events
        WHERE provider_event_id = _entity_id
        ORDER BY created_at ASC LIMIT 1;
      IF v_keeper IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

      v_before := jsonb_build_object(
        'provider_event_id', _entity_id,
        'rows', (SELECT COUNT(*) FROM billing_events WHERE provider_event_id = _entity_id)
      );

      WITH upd AS (
        UPDATE billing_events
          SET processed = true,
              processed_at = COALESCE(processed_at, now()),
              error_message = COALESCE(error_message,'') || ' [dedup-keep:' || v_keeper::text || ']'
          WHERE provider_event_id = _entity_id AND id <> v_keeper
          RETURNING 1
      )
      SELECT COUNT(*) INTO v_dups FROM upd;

      v_after := jsonb_build_object('kept', v_keeper, 'deduped_count', v_dups);
      v_action := 'deduped';
      v_severity := 'medium';
    END;

  ELSIF _validator = 'subscription_missing_invoice' AND _entity_type = 'workspace_subscription' THEN
    -- Mark for review: do not auto-create invoice; instead set sub metadata flag
    SELECT to_jsonb(s.*), s.workspace_id INTO v_before, v_workspace
    FROM workspace_subscriptions s WHERE s.id = _entity_id::uuid;
    IF v_before IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

    UPDATE workspace_subscriptions
      SET metadata = COALESCE(metadata,'{}'::jsonb)
        || jsonb_build_object(
             'reconciliation_flag', 'missing_invoice_acknowledged',
             'reconciled_by', v_caller,
             'reconciled_at', now(),
             'reconciled_reason', _reason
           )
      WHERE id = _entity_id::uuid;

    SELECT to_jsonb(s.*) INTO v_after FROM workspace_subscriptions s WHERE s.id = _entity_id::uuid;
    v_action := 'flagged_for_billing_review';
    v_severity := 'high';

  ELSE
    RAISE EXCEPTION 'unknown_validator_or_entity' USING ERRCODE = '22023';
  END IF;

  INSERT INTO platform_reconciliation_log
    (kind, validator, severity, workspace_id, entity_type, entity_id,
     before_snapshot, after_snapshot, details, reason, actor_user_id, actor_email)
  VALUES
    ('fix', _validator, v_severity, v_workspace, _entity_type, _entity_id,
     COALESCE(v_before,'{}'::jsonb), COALESCE(v_after,'{}'::jsonb),
     jsonb_build_object('action', v_action), _reason, v_caller, v_email);

  RETURN jsonb_build_object('ok', true, 'action', v_action, 'before', v_before, 'after', v_after);
END;
$$;

-- ---------------------------------------------------------
-- History
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_reconciliation_history(
  _limit int DEFAULT 100,
  _kind text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (
    has_platform_role(auth.uid(), 'platform_owner'::platform_admin_role)
    OR has_platform_role(auth.uid(), 'finance_admin'::platform_admin_role)
    OR has_platform_role(auth.uid(), 'security_admin'::platform_admin_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT * FROM platform_reconciliation_log
    WHERE (_kind IS NULL OR kind = _kind)
    ORDER BY created_at DESC
    LIMIT GREATEST(LEAST(_limit, 500), 1)
  ) r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_admin_reconciliation_scan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_reconciliation_fix(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_reconciliation_history(int, text) TO authenticated;
