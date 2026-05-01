
-- ==================== ALERTS ====================
CREATE TABLE IF NOT EXISTS public.platform_admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admin_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alerts" ON public.platform_admin_alerts
  FOR SELECT TO authenticated USING (public.is_any_platform_admin(auth.uid()));
CREATE POLICY "no direct insert alerts" ON public.platform_admin_alerts
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no direct update alerts" ON public.platform_admin_alerts
  FOR UPDATE TO authenticated USING (false);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON public.platform_admin_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_kind ON public.platform_admin_alerts (kind, created_at DESC);

-- ==================== FEATURE FLAGS ====================
CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read flags" ON public.platform_feature_flags
  FOR SELECT TO authenticated USING (public.is_any_platform_admin(auth.uid()));
CREATE POLICY "no direct write flags" ON public.platform_feature_flags
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no direct update flags" ON public.platform_feature_flags
  FOR UPDATE TO authenticated USING (false);

-- Seed default flags (idempotent)
INSERT INTO public.platform_feature_flags (key, enabled, description) VALUES
  ('platform_kill_switch', false, 'Bloqueia mutações administrativas críticas (suspend/reactivate, finance ops)'),
  ('alerts_enabled', true, 'Habilita execução de checagens automáticas de alerta'),
  ('reconciliation_auto_fix', false, 'Permite reconciliação aplicar correções automaticamente (apenas idempotentes)')
ON CONFLICT (key) DO NOTHING;

-- ==================== HELPERS ====================
CREATE OR REPLACE FUNCTION public.platform_kill_switch_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.platform_feature_flags WHERE key = 'platform_kill_switch'), false);
$$;

-- ==================== ALERT CHECK ====================
CREATE OR REPLACE FUNCTION public.platform_admin_alerts_check()
RETURNS TABLE (created integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paying integer; v_past_due integer; v_canceled_30d integer;
  v_active_30d_ago integer; v_failed_mut integer; v_pct numeric;
  v_count integer := 0;
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT COALESCE((SELECT enabled FROM public.platform_feature_flags WHERE key='alerts_enabled'), true) THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;

  -- Past_due spike
  SELECT COUNT(*) INTO v_paying FROM public.subscriptions WHERE status::text IN ('active','past_due','paused');
  SELECT COUNT(*) INTO v_past_due FROM public.subscriptions WHERE status::text = 'past_due';
  IF v_paying > 0 THEN
    v_pct := (v_past_due::numeric / v_paying::numeric);
    IF v_pct > 0.05 THEN
      INSERT INTO public.platform_admin_alerts (kind, severity, title, details)
      VALUES ('past_due_spike',
              CASE WHEN v_pct > 0.10 THEN 'critical' ELSE 'warning' END,
              'Spike de assinaturas past_due ('||round(v_pct*100,1)||'%)',
              jsonb_build_object('past_due', v_past_due, 'paying_base', v_paying, 'pct', v_pct));
      v_count := v_count + 1;
    END IF;
  END IF;

  -- Churn spike (canceled in last 30d / active 30d ago)
  SELECT COUNT(*) INTO v_canceled_30d FROM public.subscriptions
    WHERE status::text = 'canceled' AND updated_at >= now() - interval '30 days';
  SELECT COUNT(*) INTO v_active_30d_ago FROM public.subscriptions
    WHERE created_at <= now() - interval '30 days';
  IF v_active_30d_ago > 0 THEN
    v_pct := (v_canceled_30d::numeric / v_active_30d_ago::numeric);
    IF v_pct > 0.08 THEN
      INSERT INTO public.platform_admin_alerts (kind, severity, title, details)
      VALUES ('churn_spike',
              CASE WHEN v_pct > 0.15 THEN 'critical' ELSE 'warning' END,
              'Churn 30d acima do limite ('||round(v_pct*100,1)||'%)',
              jsonb_build_object('canceled_30d', v_canceled_30d, 'base', v_active_30d_ago, 'pct', v_pct));
      v_count := v_count + 1;
    END IF;
  END IF;

  -- Critical mutation failures (admin actions log entries with event ending in _failed in last 1h)
  SELECT COUNT(*) INTO v_failed_mut FROM public.platform_admin_actions_log
    WHERE created_at >= now() - interval '1 hour'
      AND event ~ '_(failed|error)$';
  IF v_failed_mut > 3 THEN
    INSERT INTO public.platform_admin_alerts (kind, severity, title, details)
    VALUES ('mutation_failures',
            CASE WHEN v_failed_mut > 10 THEN 'critical' ELSE 'warning' END,
            'Falhas de mutação críticas na última hora: '||v_failed_mut,
            jsonb_build_object('count', v_failed_mut, 'window', '1h'));
    v_count := v_count + 1;
  END IF;

  RETURN QUERY SELECT v_count;
END;
$$;

-- ==================== ALERTS LIST / ACK / RESOLVE ====================
CREATE OR REPLACE FUNCTION public.platform_admin_alerts_list(
  _status text DEFAULT NULL, _limit integer DEFAULT 100
)
RETURNS SETOF public.platform_admin_alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT * FROM public.platform_admin_alerts
    WHERE (_status IS NULL OR status = _status)
    ORDER BY created_at DESC LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_alert_ack(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.platform_admin_alerts
    SET status='acknowledged', acknowledged_by=auth.uid(), acknowledged_at=now()
    WHERE id=_id AND status='open';
  PERFORM public.log_platform_admin_event('alert_ack','/operations', jsonb_build_object('alert_id',_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_alert_resolve(_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _note IS NULL OR length(trim(_note)) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.platform_admin_alerts
    SET status='resolved', resolved_by=auth.uid(), resolved_at=now(), resolution_note=_note
    WHERE id=_id;
  PERFORM public.log_platform_admin_event('alert_resolve','/operations',
    jsonb_build_object('alert_id',_id,'note',_note));
END;
$$;

-- ==================== FEATURE FLAGS RPC ====================
CREATE OR REPLACE FUNCTION public.platform_admin_flag_list()
RETURNS SETOF public.platform_feature_flags
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.platform_feature_flags ORDER BY key;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_flag_set(_key text, _enabled boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev boolean;
BEGIN
  IF NOT (public.has_platform_role(auth.uid(),'platform_owner') OR
          public.has_platform_role(auth.uid(),'security_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;
  SELECT enabled INTO v_prev FROM public.platform_feature_flags WHERE key=_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown flag %', _key; END IF;
  UPDATE public.platform_feature_flags
    SET enabled=_enabled, updated_by=auth.uid(), updated_at=now()
    WHERE key=_key;
  PERFORM public.log_platform_admin_event('flag_set','/operations',
    jsonb_build_object('key',_key,'from',v_prev,'to',_enabled,'reason',_reason));
END;
$$;
