
-- =====================================================================
-- Phase H5: Billing enforcement infrastructure
-- =====================================================================

-- Global settings (singleton row keyed by environment)
CREATE TABLE IF NOT EXISTS public.billing_enforcement_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL UNIQUE DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT true,
  default_mode text NOT NULL DEFAULT 'warn_only'
    CHECK (default_mode IN ('warn_only','soft_block','hard_block')),
  feature_modes jsonb NOT NULL DEFAULT '{}'::jsonb,
  kill_switch boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.billing_enforcement_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read enforcement settings"
  ON public.billing_enforcement_settings FOR SELECT
  TO authenticated USING (true);

-- Per-workspace override
CREATE TABLE IF NOT EXISTS public.billing_enforcement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  mode text CHECK (mode IN ('warn_only','soft_block','hard_block')),
  feature_key text,
  allowlisted boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  override_until timestamptz,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_enf_overrides_ws
  ON public.billing_enforcement_overrides (workspace_id);

ALTER TABLE public.billing_enforcement_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read overrides"
  ON public.billing_enforcement_overrides FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins create overrides"
  ON public.billing_enforcement_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update overrides"
  ON public.billing_enforcement_overrides FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete overrides"
  ON public.billing_enforcement_overrides FOR DELETE
  TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Enforcement audit logs
CREATE TABLE IF NOT EXISTS public.billing_enforcement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid,
  feature_key text NOT NULL,
  action text NOT NULL,
  decision text NOT NULL
    CHECK (decision IN ('allowed','warned','soft_blocked','hard_blocked','override_applied')),
  mode text NOT NULL,
  current_usage numeric,
  limit_value numeric,
  increment_by numeric DEFAULT 1,
  reason_code text,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_enf_logs_ws_created
  ON public.billing_enforcement_logs (workspace_id, created_at DESC);

ALTER TABLE public.billing_enforcement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read enforcement logs"
  ON public.billing_enforcement_logs FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Inserts go through SECURITY DEFINER function only
CREATE POLICY "No direct inserts on enforcement logs"
  ON public.billing_enforcement_logs FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- RPC: billing_check_entitlement
-- Evaluates a feature usage attempt and returns { allowed, mode, ... }.
-- Logs the decision and updates current_usage when allowed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_check_entitlement(
  _workspace_id uuid,
  _feature_key text,
  _increment_by numeric DEFAULT 1,
  _action text DEFAULT 'check',
  _context jsonb DEFAULT '{}'::jsonb,
  _commit_usage boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings  RECORD;
  v_override  RECORD;
  v_ent       RECORD;
  v_mode      text;
  v_limit     numeric;
  v_usage     numeric;
  v_projected numeric;
  v_allowed   boolean := true;
  v_decision  text := 'allowed';
  v_reason    text := NULL;
  v_actor     uuid := auth.uid();
BEGIN
  IF _workspace_id IS NULL OR _feature_key IS NULL THEN
    RAISE EXCEPTION 'workspace_id and feature_key are required';
  END IF;

  SELECT * INTO v_settings
    FROM public.billing_enforcement_settings
   WHERE environment = 'default'
   LIMIT 1;

  -- Kill switch / disabled => everything is allowed (warn_only behavior)
  IF v_settings IS NULL OR v_settings.enabled = false OR v_settings.kill_switch = true THEN
    v_mode := 'warn_only';
  ELSE
    v_mode := COALESCE(v_settings.feature_modes->>_feature_key, v_settings.default_mode);
  END IF;

  -- Per-workspace override (most recent active wins)
  SELECT * INTO v_override
    FROM public.billing_enforcement_overrides
   WHERE workspace_id = _workspace_id
     AND (feature_key IS NULL OR feature_key = _feature_key)
     AND (override_until IS NULL OR override_until > now())
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_override IS NOT NULL THEN
    IF v_override.allowlisted = true THEN
      v_mode := 'warn_only';
      v_decision := 'override_applied';
    ELSIF v_override.mode IS NOT NULL THEN
      v_mode := v_override.mode;
    END IF;
  END IF;

  -- Current entitlement / usage
  SELECT enabled, limit_value, current_usage
    INTO v_ent
    FROM public.workspace_entitlements
   WHERE workspace_id = _workspace_id
     AND feature_key = _feature_key
   LIMIT 1;

  IF v_ent IS NULL THEN
    -- Feature not declared -> treat as unlimited (no plan opinion)
    v_limit := NULL;
    v_usage := 0;
  ELSIF v_ent.enabled = false THEN
    v_limit := 0;
    v_usage := COALESCE(v_ent.current_usage, 0);
  ELSE
    v_limit := v_ent.limit_value; -- may be NULL = unlimited
    v_usage := COALESCE(v_ent.current_usage, 0);
  END IF;

  v_projected := v_usage + COALESCE(_increment_by, 0);

  IF v_limit IS NULL THEN
    v_allowed := true;
    v_decision := CASE WHEN v_decision = 'override_applied' THEN 'override_applied' ELSE 'allowed' END;
  ELSIF v_projected <= v_limit THEN
    v_allowed := true;
    v_decision := CASE WHEN v_decision = 'override_applied' THEN 'override_applied' ELSE 'allowed' END;
  ELSE
    -- exceeded
    v_reason := CASE WHEN v_usage >= v_limit THEN 'LIMIT_EXCEEDED' ELSE 'LIMIT_REACHED' END;
    IF v_mode = 'warn_only' THEN
      v_allowed := true;
      v_decision := 'warned';
    ELSIF v_mode = 'soft_block' THEN
      v_allowed := false;
      v_decision := 'soft_blocked';
    ELSE
      v_allowed := false;
      v_decision := 'hard_blocked';
    END IF;
  END IF;

  -- Commit usage if caller asked and we allowed it
  IF v_allowed AND _commit_usage AND v_ent IS NOT NULL THEN
    UPDATE public.workspace_entitlements
       SET current_usage = GREATEST(0, COALESCE(current_usage, 0) + _increment_by),
           updated_at = now()
     WHERE workspace_id = _workspace_id
       AND feature_key = _feature_key;
  END IF;

  -- Log (best effort)
  INSERT INTO public.billing_enforcement_logs(
    workspace_id, user_id, feature_key, action, decision, mode,
    current_usage, limit_value, increment_by, reason_code, context
  ) VALUES (
    _workspace_id, v_actor, _feature_key, COALESCE(_action,'check'), v_decision, v_mode,
    v_usage, v_limit, _increment_by, v_reason, COALESCE(_context, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'mode', v_mode,
    'decision', v_decision,
    'feature_key', _feature_key,
    'current_usage', v_usage,
    'limit_value', v_limit,
    'projected_usage', v_projected,
    'reason_code', v_reason,
    'override_active', (v_override IS NOT NULL)
  );
END;
$$;

-- Helper to decrement usage when a resource is removed
CREATE OR REPLACE FUNCTION public.billing_decrement_usage(
  _workspace_id uuid,
  _feature_key text,
  _decrement_by numeric DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.workspace_entitlements
     SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(_decrement_by, 1)),
         updated_at = now()
   WHERE workspace_id = _workspace_id
     AND feature_key = _feature_key;
END;
$$;

-- Apply admin override with audit
CREATE OR REPLACE FUNCTION public.billing_apply_override(
  _workspace_id uuid,
  _mode text,
  _feature_key text,
  _allowlisted boolean,
  _reason text,
  _override_until timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_workspace_admin(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only workspace admins can apply enforcement overrides';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason is required for an enforcement override';
  END IF;

  INSERT INTO public.billing_enforcement_overrides(
    workspace_id, mode, feature_key, allowlisted, reason, override_until, applied_by
  ) VALUES (
    _workspace_id, _mode, _feature_key, COALESCE(_allowlisted,false), _reason, _override_until, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.admin_actions_log(admin_user_id, workspace_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _workspace_id, 'billing.override_applied', 'workspace', _workspace_id::text,
    jsonb_build_object(
      'override_id', v_id, 'mode', _mode, 'feature_key', _feature_key,
      'allowlisted', _allowlisted, 'reason', _reason, 'override_until', _override_until
    ));

  RETURN v_id;
END;
$$;

-- Seed default settings
INSERT INTO public.billing_enforcement_settings(environment, enabled, default_mode, kill_switch)
VALUES ('default', true, 'warn_only', false)
ON CONFLICT (environment) DO NOTHING;
