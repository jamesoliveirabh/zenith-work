-- Phase H7 — Billing Backoffice: platform-admin RBAC + admin RPCs

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_platform_admin_idx
  ON public.profiles(is_platform_admin) WHERE is_platform_admin = true;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM public.profiles WHERE id = _user), false);
$$;

DROP POLICY IF EXISTS "Platform admins read all workspaces" ON public.workspaces;
CREATE POLICY "Platform admins read all workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all subs" ON public.workspace_subscriptions;
CREATE POLICY "Platform admins read all subs" ON public.workspace_subscriptions
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all invoices" ON public.workspace_invoices;
CREATE POLICY "Platform admins read all invoices" ON public.workspace_invoices
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all entitlements" ON public.workspace_entitlements;
CREATE POLICY "Platform admins read all entitlements" ON public.workspace_entitlements
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all billing events" ON public.billing_events;
CREATE POLICY "Platform admins read all billing events" ON public.billing_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all admin actions" ON public.admin_actions_log;
CREATE POLICY "Platform admins read all admin actions" ON public.admin_actions_log
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all dunning cases" ON public.billing_dunning_cases;
CREATE POLICY "Platform admins read all dunning cases" ON public.billing_dunning_cases
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all dunning attempts" ON public.billing_dunning_attempts;
CREATE POLICY "Platform admins read all dunning attempts" ON public.billing_dunning_attempts
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins read all profiles" ON public.profiles;
CREATE POLICY "Platform admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_billing_log_action(
  _workspace_id uuid, _action text, _target_type text, _target_id text,
  _metadata jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  IF _action IS NULL OR length(trim(_action)) = 0 THEN
    RAISE EXCEPTION 'action is required';
  END IF;
  INSERT INTO public.admin_actions_log(admin_user_id, workspace_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _workspace_id, _action, _target_type, _target_id,
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('reason', _reason, 'logged_at', now()))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_list_accounts(
  _search text DEFAULT NULL, _plan_code text DEFAULT NULL,
  _sub_status text DEFAULT NULL, _dunning_status text DEFAULT NULL,
  _limit int DEFAULT 50, _offset int DEFAULT 0
) RETURNS TABLE (
  workspace_id uuid, workspace_name text, workspace_slug text,
  owner_id uuid, owner_email text, owner_name text,
  plan_id uuid, plan_code text, plan_name text,
  price_cents integer, currency text, plan_interval text,
  subscription_id uuid, sub_status text, cancel_at_period_end boolean,
  current_period_end timestamptz, trial_ends_at timestamptz,
  provider text, dunning_status text, open_dunning_case_id uuid,
  updated_at timestamptz, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      w.id AS workspace_id, w.name AS workspace_name, w.slug AS workspace_slug,
      w.owner_id, op.email AS owner_email, op.display_name AS owner_name,
      s.id AS subscription_id, s.plan_id,
      p.code AS plan_code, p.name AS plan_name, p.price_cents, p.currency,
      p.interval::text AS plan_interval,
      s.status::text AS sub_status, s.cancel_at_period_end,
      s.current_period_end, s.trial_ends_at,
      s.billing_provider::text AS provider,
      dc.id AS open_dunning_case_id, dc.status::text AS dunning_status,
      GREATEST(w.updated_at, COALESCE(s.updated_at, w.updated_at)) AS updated_at
    FROM public.workspaces w
    LEFT JOIN public.workspace_subscriptions s ON s.workspace_id = w.id
    LEFT JOIN public.plans p ON p.id = s.plan_id
    LEFT JOIN public.profiles op ON op.id = w.owner_id
    LEFT JOIN LATERAL (
      SELECT id, status FROM public.billing_dunning_cases
       WHERE workspace_id = w.id AND status IN ('open','recovering','exhausted')
       ORDER BY created_at DESC LIMIT 1
    ) dc ON true
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_search IS NULL OR _search = '' OR
           workspace_name ILIKE '%'||_search||'%' OR
           COALESCE(workspace_slug,'') ILIKE '%'||_search||'%' OR
           COALESCE(owner_email,'') ILIKE '%'||_search||'%' OR
           workspace_id::text = _search)
      AND (_plan_code IS NULL OR plan_code = _plan_code)
      AND (_sub_status IS NULL OR sub_status = _sub_status)
      AND (_dunning_status IS NULL OR dunning_status = _dunning_status)
  ),
  counted AS (SELECT *, count(*) OVER() AS total_count FROM filtered)
  SELECT
    counted.workspace_id, counted.workspace_name, counted.workspace_slug,
    counted.owner_id, counted.owner_email, counted.owner_name,
    counted.plan_id, counted.plan_code, counted.plan_name,
    counted.price_cents, counted.currency, counted.plan_interval,
    counted.subscription_id, counted.sub_status, counted.cancel_at_period_end,
    counted.current_period_end, counted.trial_ends_at,
    counted.provider, counted.dunning_status, counted.open_dunning_case_id,
    counted.updated_at, counted.total_count
  FROM counted
  ORDER BY counted.updated_at DESC NULLS LAST
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_metrics(_window_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total int; v_past_due int; v_open_dunning int;
  v_recent_cancels int; v_recent_recoveries int; v_mrr_cents bigint;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  SELECT count(*) INTO v_total FROM public.workspaces;
  SELECT count(*) INTO v_past_due FROM public.workspace_subscriptions WHERE status::text = 'past_due';
  SELECT count(*) INTO v_open_dunning FROM public.billing_dunning_cases WHERE status IN ('open','recovering','exhausted');
  SELECT count(*) INTO v_recent_cancels FROM public.billing_events
    WHERE event_type = 'subscription.canceled' AND created_at > now() - (_window_days || ' days')::interval;
  SELECT count(*) INTO v_recent_recoveries FROM public.billing_events
    WHERE event_type = 'dunning.recovered' AND created_at > now() - (_window_days || ' days')::interval;
  SELECT COALESCE(SUM(p.price_cents),0) INTO v_mrr_cents
    FROM public.workspace_subscriptions s JOIN public.plans p ON p.id = s.plan_id
   WHERE s.status::text IN ('active','trialing','past_due');

  RETURN jsonb_build_object(
    'total_accounts', v_total, 'past_due', v_past_due,
    'open_dunning_cases', v_open_dunning,
    'recent_cancellations', v_recent_cancels,
    'recent_recoveries', v_recent_recoveries,
    'mrr_cents_estimate', v_mrr_cents,
    'window_days', _window_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_account_detail(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace jsonb; v_owner jsonb; v_subscription jsonb; v_plan jsonb;
  v_invoices jsonb; v_dunning_case jsonb; v_dunning_attempts jsonb;
  v_entitlements jsonb; v_events jsonb; v_admin_actions jsonb;
  v_overrides jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;

  SELECT to_jsonb(w) INTO v_workspace FROM public.workspaces w WHERE id = _workspace_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'workspace not found'; END IF;

  SELECT to_jsonb(p) INTO v_owner FROM public.profiles p
   WHERE p.id = (v_workspace->>'owner_id')::uuid;
  SELECT to_jsonb(s) INTO v_subscription FROM public.workspace_subscriptions s
   WHERE s.workspace_id = _workspace_id;
  SELECT to_jsonb(p) INTO v_plan FROM public.plans p
   WHERE p.id = (v_subscription->>'plan_id')::uuid;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC), '[]'::jsonb)
    INTO v_invoices
    FROM (SELECT * FROM public.workspace_invoices
          WHERE workspace_id = _workspace_id
          ORDER BY created_at DESC LIMIT 50) i;

  SELECT to_jsonb(c) INTO v_dunning_case FROM public.billing_dunning_cases c
   WHERE c.workspace_id = _workspace_id AND c.status IN ('open','recovering','exhausted')
   ORDER BY c.created_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at ASC), '[]'::jsonb)
    INTO v_dunning_attempts FROM public.billing_dunning_attempts a
   WHERE a.dunning_case_id = (v_dunning_case->>'id')::uuid;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.feature_key), '[]'::jsonb)
    INTO v_entitlements FROM public.workspace_entitlements e
   WHERE e.workspace_id = _workspace_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO v_overrides FROM public.billing_enforcement_overrides o
   WHERE o.workspace_id = _workspace_id
     AND (o.override_until IS NULL OR o.override_until > now());

  SELECT COALESCE(jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC), '[]'::jsonb)
    INTO v_events FROM (SELECT * FROM public.billing_events
                        WHERE workspace_id = _workspace_id
                        ORDER BY created_at DESC LIMIT 50) ev;

  SELECT COALESCE(jsonb_agg(to_jsonb(al) ORDER BY al.created_at DESC), '[]'::jsonb)
    INTO v_admin_actions FROM (SELECT * FROM public.admin_actions_log
                               WHERE workspace_id = _workspace_id
                               ORDER BY created_at DESC LIMIT 50) al;

  RETURN jsonb_build_object(
    'workspace', v_workspace, 'owner', v_owner,
    'subscription', v_subscription, 'plan', v_plan,
    'invoices', v_invoices,
    'dunning_case', v_dunning_case, 'dunning_attempts', v_dunning_attempts,
    'entitlements', v_entitlements, 'overrides', v_overrides,
    'events', v_events, 'admin_actions', v_admin_actions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_apply_entitlement_override(
  _workspace_id uuid, _mode text, _feature_key text, _allowlisted boolean,
  _reason text, _override_until timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;
  INSERT INTO public.billing_enforcement_overrides(
    workspace_id, mode, feature_key, allowlisted, reason, override_until, applied_by
  ) VALUES (
    _workspace_id, _mode, _feature_key, COALESCE(_allowlisted,false), _reason, _override_until, auth.uid()
  ) RETURNING id INTO v_id;

  PERFORM public.admin_billing_log_action(
    _workspace_id, 'billing.override_applied', 'workspace', _workspace_id::text,
    jsonb_build_object('override_id', v_id, 'mode', _mode, 'feature_key', _feature_key,
                       'allowlisted', _allowlisted, 'override_until', _override_until),
    _reason
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_remove_entitlement_override(
  _override_id uuid, _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ws uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  SELECT workspace_id INTO v_ws FROM public.billing_enforcement_overrides WHERE id = _override_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'override not found'; END IF;
  DELETE FROM public.billing_enforcement_overrides WHERE id = _override_id;
  PERFORM public.admin_billing_log_action(
    v_ws, 'billing.override_removed', 'override', _override_id::text,
    jsonb_build_object('override_id', _override_id), _reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_extend_trial(
  _workspace_id uuid, _additional_days int, _reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.workspace_subscriptions;
  v_new_trial_end timestamptz; v_old_trial_end timestamptz;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  IF _additional_days <= 0 THEN RAISE EXCEPTION 'additional_days must be > 0'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'reason required'; END IF;

  SELECT * INTO s FROM public.workspace_subscriptions
   WHERE workspace_id = _workspace_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'subscription not found'; END IF;

  v_old_trial_end := s.trial_ends_at;
  v_new_trial_end := COALESCE(s.trial_ends_at, now()) + (_additional_days || ' days')::interval;

  UPDATE public.workspace_subscriptions
     SET trial_ends_at = v_new_trial_end,
         status = CASE WHEN s.status::text = 'canceled' THEN s.status ELSE 'trialing'::subscription_status END,
         updated_at = now()
   WHERE id = s.id;

  PERFORM public.billing_record_event(
    _workspace_id, s.id, 'mock', 'subscription.trial_extended',
    jsonb_build_object('additional_days', _additional_days,
                       'previous_trial_ends_at', v_old_trial_end,
                       'new_trial_ends_at', v_new_trial_end), NULL
  );
  PERFORM public.admin_billing_log_action(
    _workspace_id, 'billing.trial_extended', 'subscription', s.id::text,
    jsonb_build_object('additional_days', _additional_days,
                       'before', jsonb_build_object('trial_ends_at', v_old_trial_end),
                       'after',  jsonb_build_object('trial_ends_at', v_new_trial_end)),
    _reason
  );
  RETURN jsonb_build_object('trial_ends_at', v_new_trial_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_billing_mark_invoice(
  _invoice_id uuid, _new_status text, _reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv public.workspace_invoices;
  v_before jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: platform admin required';
  END IF;
  IF _new_status NOT IN ('paid','void','uncollectible','open') THEN
    RAISE EXCEPTION 'invalid status: %', _new_status;
  END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'reason required'; END IF;

  SELECT * INTO inv FROM public.workspace_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice not found'; END IF;
  v_before := jsonb_build_object('status', inv.status, 'amount_paid_cents', inv.amount_paid_cents, 'paid_at', inv.paid_at);

  IF _new_status = 'paid' THEN
    UPDATE public.workspace_invoices
       SET status='paid', amount_paid_cents = amount_due_cents, paid_at = now(), updated_at = now()
     WHERE id = _invoice_id;
  ELSE
    UPDATE public.workspace_invoices
       SET status = _new_status::invoice_status, updated_at = now()
     WHERE id = _invoice_id;
  END IF;

  PERFORM public.billing_record_event(
    inv.workspace_id, inv.subscription_id, 'mock',
    'invoice.admin_marked_' || _new_status,
    jsonb_build_object('invoice_id', _invoice_id, 'before', v_before), NULL
  );
  PERFORM public.admin_billing_log_action(
    inv.workspace_id, 'billing.invoice_marked_' || _new_status,
    'invoice', _invoice_id::text,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object('status', _new_status)),
    _reason
  );
  RETURN jsonb_build_object('ok', true, 'status', _new_status);
END;
$$;
