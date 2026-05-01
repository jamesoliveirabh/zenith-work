-- Phase H6 — Billing Dunning lifecycle

CREATE TABLE IF NOT EXISTS public.billing_dunning_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL UNIQUE,
  max_retries integer NOT NULL DEFAULT 3,
  retry_schedule_days integer[] NOT NULL DEFAULT ARRAY[1,3,5],
  grace_period_days integer NOT NULL DEFAULT 7,
  auto_cancel_after_grace boolean NOT NULL DEFAULT true,
  pause_features_during_past_due boolean NOT NULL DEFAULT false,
  enforcement_mode_during_past_due text NOT NULL DEFAULT 'soft_block',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_dunning_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read dunning policies"
  ON public.billing_dunning_policies FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins insert dunning policies"
  ON public.billing_dunning_policies FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update dunning policies"
  ON public.billing_dunning_policies FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_billing_dunning_policies_updated
  BEFORE UPDATE ON public.billing_dunning_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.billing_dunning_policies (workspace_id) VALUES (NULL)
ON CONFLICT (workspace_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_dunning_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','recovering','recovered','exhausted','canceled')),
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  grace_ends_at timestamptz,
  closed_at timestamptz,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_dunning_cases_open_invoice_uq
  ON public.billing_dunning_cases (invoice_id)
  WHERE status IN ('open','recovering');

CREATE INDEX IF NOT EXISTS billing_dunning_cases_workspace_idx
  ON public.billing_dunning_cases (workspace_id, status);

CREATE INDEX IF NOT EXISTS billing_dunning_cases_due_idx
  ON public.billing_dunning_cases (next_retry_at)
  WHERE status IN ('open','recovering');

ALTER TABLE public.billing_dunning_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read dunning cases"
  ON public.billing_dunning_cases FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_billing_dunning_cases_updated
  BEFORE UPDATE ON public.billing_dunning_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.billing_dunning_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dunning_case_id uuid NOT NULL REFERENCES public.billing_dunning_cases(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK (result IN ('failed','paid','skipped')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_dunning_attempts_case_idx
  ON public.billing_dunning_attempts (dunning_case_id, attempt_number);

ALTER TABLE public.billing_dunning_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read dunning attempts"
  ON public.billing_dunning_attempts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.billing_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  template text NOT NULL,
  recipient_user_id uuid,
  recipient_email text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_email_outbox_ws_idx
  ON public.billing_email_outbox (workspace_id, created_at DESC);

ALTER TABLE public.billing_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read email outbox"
  ON public.billing_email_outbox FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ===== RPCs =====

CREATE OR REPLACE FUNCTION public.billing_dunning_get_policy(_workspace_id uuid)
RETURNS public.billing_dunning_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pol public.billing_dunning_policies;
BEGIN
  SELECT * INTO pol FROM public.billing_dunning_policies WHERE workspace_id = _workspace_id LIMIT 1;
  IF pol.id IS NOT NULL THEN RETURN pol; END IF;
  SELECT * INTO pol FROM public.billing_dunning_policies WHERE workspace_id IS NULL LIMIT 1;
  RETURN pol;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_compute_next_retry(_attempt_count integer, _schedule integer[])
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE delay_days integer;
BEGIN
  IF _schedule IS NULL OR array_length(_schedule, 1) IS NULL THEN RETURN NULL; END IF;
  IF _attempt_count + 1 > array_length(_schedule, 1) THEN
    delay_days := _schedule[array_length(_schedule, 1)];
  ELSE
    delay_days := _schedule[_attempt_count + 1];
  END IF;
  RETURN now() + (delay_days || ' days')::interval;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_open_case(
  _workspace_id uuid, _subscription_id uuid, _invoice_id uuid, _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_case_id uuid;
  pol public.billing_dunning_policies;
BEGIN
  SELECT id INTO v_case_id FROM public.billing_dunning_cases
   WHERE invoice_id = _invoice_id AND status IN ('open','recovering') LIMIT 1;
  IF v_case_id IS NOT NULL THEN RETURN v_case_id; END IF;

  pol := public.billing_dunning_get_policy(_workspace_id);

  INSERT INTO public.billing_dunning_cases(
    workspace_id, subscription_id, invoice_id, status, retry_count,
    next_retry_at, grace_ends_at, reason
  ) VALUES (
    _workspace_id, _subscription_id, _invoice_id, 'open', 0,
    public.billing_dunning_compute_next_retry(0, pol.retry_schedule_days),
    now() + (pol.grace_period_days || ' days')::interval,
    _reason
  ) RETURNING id INTO v_case_id;

  UPDATE public.workspace_subscriptions
     SET status = 'past_due', updated_at = now()
   WHERE id = _subscription_id AND status NOT IN ('canceled');

  PERFORM public.billing_record_event(
    _workspace_id, _subscription_id, 'mock', 'dunning.case_opened',
    jsonb_build_object('case_id', v_case_id, 'invoice_id', _invoice_id, 'reason', _reason),
    NULL
  );

  INSERT INTO public.billing_email_outbox(workspace_id, template, payload)
  VALUES (_workspace_id, 'payment_failed_initial',
          jsonb_build_object('case_id', v_case_id, 'invoice_id', _invoice_id));

  RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_record_attempt(
  _case_id uuid, _result text, _reason text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.billing_dunning_cases;
  pol public.billing_dunning_policies;
  v_next_attempt integer;
  v_next_retry timestamptz;
  v_new_status text;
BEGIN
  SELECT * INTO c FROM public.billing_dunning_cases WHERE id = _case_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'dunning case not found'; END IF;
  IF c.status IN ('recovered','canceled') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'case_closed');
  END IF;

  pol := public.billing_dunning_get_policy(c.workspace_id);
  v_next_attempt := c.retry_count + 1;

  INSERT INTO public.billing_dunning_attempts(
    dunning_case_id, workspace_id, attempt_number, result, reason, metadata
  ) VALUES (_case_id, c.workspace_id, v_next_attempt, _result, _reason, COALESCE(_metadata,'{}'::jsonb));

  IF _result = 'paid' THEN
    UPDATE public.workspace_invoices
       SET status='paid', amount_paid_cents = amount_due_cents, paid_at = now(), updated_at = now()
     WHERE id = c.invoice_id;
    UPDATE public.workspace_subscriptions
       SET status = 'active', updated_at = now()
     WHERE id = c.subscription_id;
    UPDATE public.billing_dunning_cases
       SET status = 'recovered', retry_count = v_next_attempt,
           next_retry_at = NULL, closed_at = now()
     WHERE id = _case_id;

    PERFORM public.billing_record_event(
      c.workspace_id, c.subscription_id, 'mock', 'dunning.recovered',
      jsonb_build_object('case_id', _case_id, 'attempt', v_next_attempt), NULL);
    INSERT INTO public.billing_email_outbox(workspace_id, template, payload)
    VALUES (c.workspace_id, 'account_recovered', jsonb_build_object('case_id', _case_id));

    RETURN jsonb_build_object('status','recovered','attempt',v_next_attempt);
  END IF;

  IF v_next_attempt >= pol.max_retries THEN
    v_new_status := 'exhausted';
    v_next_retry := NULL;
  ELSE
    v_new_status := 'recovering';
    v_next_retry := public.billing_dunning_compute_next_retry(v_next_attempt, pol.retry_schedule_days);
  END IF;

  UPDATE public.billing_dunning_cases
     SET status = v_new_status, retry_count = v_next_attempt, next_retry_at = v_next_retry
   WHERE id = _case_id;

  PERFORM public.billing_record_event(
    c.workspace_id, c.subscription_id, 'mock', 'dunning.retry_failed',
    jsonb_build_object('case_id', _case_id, 'attempt', v_next_attempt, 'next_retry_at', v_next_retry),
    NULL);

  INSERT INTO public.billing_email_outbox(workspace_id, template, payload)
  VALUES (c.workspace_id,
          CASE WHEN v_new_status='exhausted' THEN 'grace_period_ending'
               ELSE 'payment_failed_retry_reminder' END,
          jsonb_build_object('case_id', _case_id, 'attempt', v_next_attempt));

  RETURN jsonb_build_object('status', v_new_status, 'attempt', v_next_attempt, 'next_retry_at', v_next_retry);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_list_due(_now timestamptz DEFAULT now(), _limit integer DEFAULT 100)
RETURNS SETOF public.billing_dunning_cases
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.billing_dunning_cases
   WHERE status IN ('open','recovering')
     AND next_retry_at IS NOT NULL
     AND next_retry_at <= _now
   ORDER BY next_retry_at ASC
   LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_process_expired_grace(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  pol public.billing_dunning_policies;
  v_free_id uuid;
  v_count integer := 0;
BEGIN
  SELECT id INTO v_free_id FROM public.plans WHERE code='free' AND is_active=true LIMIT 1;

  FOR rec IN
    SELECT * FROM public.billing_dunning_cases
     WHERE status IN ('open','recovering','exhausted')
       AND grace_ends_at IS NOT NULL
       AND grace_ends_at <= _now
  LOOP
    pol := public.billing_dunning_get_policy(rec.workspace_id);

    IF pol.auto_cancel_after_grace THEN
      UPDATE public.workspace_subscriptions
         SET status='canceled',
             canceled_at = COALESCE(canceled_at, now()),
             plan_id = v_free_id,
             cancel_at_period_end = false,
             updated_at = now()
       WHERE id = rec.subscription_id;
      PERFORM public.billing_sync_entitlements(rec.workspace_id, v_free_id);

      UPDATE public.billing_dunning_cases
         SET status='canceled', closed_at = now(), next_retry_at = NULL,
             reason = COALESCE(reason, 'grace_expired_auto_cancel')
       WHERE id = rec.id;

      PERFORM public.billing_record_event(
        rec.workspace_id, rec.subscription_id, 'mock', 'dunning.canceled_nonpayment',
        jsonb_build_object('case_id', rec.id), NULL);
      INSERT INTO public.billing_email_outbox(workspace_id, template, payload)
      VALUES (rec.workspace_id, 'subscription_canceled_nonpayment',
              jsonb_build_object('case_id', rec.id));
    ELSE
      PERFORM public.billing_record_event(
        rec.workspace_id, rec.subscription_id, 'mock', 'dunning.grace_expired',
        jsonb_build_object('case_id', rec.id, 'auto_cancel', false), NULL);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_extend_grace(
  _case_id uuid, _additional_days integer, _reason text
) RETURNS public.billing_dunning_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.billing_dunning_cases;
BEGIN
  SELECT * INTO c FROM public.billing_dunning_cases WHERE id = _case_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'dunning case not found'; END IF;
  IF NOT public.is_workspace_admin(c.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only workspace admins can extend grace';
  END IF;
  IF _additional_days <= 0 THEN RAISE EXCEPTION 'additional_days must be > 0'; END IF;

  UPDATE public.billing_dunning_cases
     SET grace_ends_at = COALESCE(grace_ends_at, now()) + (_additional_days || ' days')::interval,
         metadata = COALESCE(metadata,'{}'::jsonb)
                    || jsonb_build_object('extensions',
                          COALESCE(metadata->'extensions','[]'::jsonb)
                          || jsonb_build_array(jsonb_build_object(
                              'days', _additional_days, 'reason', _reason,
                              'by', auth.uid(), 'at', now())))
   WHERE id = _case_id RETURNING * INTO c;

  INSERT INTO public.admin_actions_log(admin_user_id, workspace_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), c.workspace_id, 'billing.dunning.extend_grace',
          'dunning_case', c.id::text,
          jsonb_build_object('additional_days', _additional_days, 'reason', _reason));

  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_dunning_cancel_for_nonpayment(_case_id uuid, _reason text)
RETURNS public.billing_dunning_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.billing_dunning_cases;
  v_free_id uuid;
BEGIN
  SELECT * INTO c FROM public.billing_dunning_cases WHERE id = _case_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'dunning case not found'; END IF;
  IF NOT public.is_workspace_admin(c.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only workspace admins can cancel for non-payment';
  END IF;

  SELECT id INTO v_free_id FROM public.plans WHERE code='free' AND is_active=true LIMIT 1;

  UPDATE public.workspace_subscriptions
     SET status='canceled', canceled_at = COALESCE(canceled_at, now()),
         plan_id = v_free_id, cancel_at_period_end=false, updated_at=now()
   WHERE id = c.subscription_id;
  PERFORM public.billing_sync_entitlements(c.workspace_id, v_free_id);

  UPDATE public.billing_dunning_cases
     SET status='canceled', closed_at = now(), next_retry_at = NULL,
         reason = COALESCE(_reason, 'admin_canceled_nonpayment')
   WHERE id = _case_id RETURNING * INTO c;

  PERFORM public.billing_record_event(
    c.workspace_id, c.subscription_id, 'mock', 'dunning.canceled_nonpayment',
    jsonb_build_object('case_id', c.id, 'admin_action', true, 'reason', _reason), NULL);
  INSERT INTO public.billing_email_outbox(workspace_id, template, payload)
  VALUES (c.workspace_id, 'subscription_canceled_nonpayment',
          jsonb_build_object('case_id', c.id, 'admin_action', true));

  INSERT INTO public.admin_actions_log(admin_user_id, workspace_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), c.workspace_id, 'billing.dunning.cancel_nonpayment',
          'dunning_case', c.id::text, jsonb_build_object('reason', _reason));

  RETURN c;
END;
$$;