-- Fase H2: helpers de domínio para o motor mock de billing

-- Coluna metadata para guardar pending_plan_change e similares
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- billing_record_event: idempotência por (provider, provider_event_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_record_event(
  _workspace_id uuid,
  _subscription_id uuid,
  _provider text,
  _event_type text,
  _payload jsonb,
  _provider_event_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _provider_event_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.billing_events
    WHERE provider = _provider
      AND provider_event_id = _provider_event_id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.billing_events(
    workspace_id, subscription_id, provider, provider_event_id, event_type, payload, processed, processed_at
  ) VALUES (
    _workspace_id, _subscription_id, _provider, _provider_event_id, _event_type,
    COALESCE(_payload, '{}'::jsonb), true, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- billing_sync_entitlements: aplica limits_json do plano ao workspace
-- Não zera current_usage. Habilita feature; se valor for 0 -> enabled=false.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_sync_entitlements(
  _workspace_id uuid,
  _plan_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limits jsonb;
  k text;
  v jsonb;
  v_int integer;
  v_enabled boolean;
BEGIN
  IF _plan_id IS NULL THEN
    -- Sem plano: desabilita tudo (mantém linhas e usage)
    UPDATE public.workspace_entitlements
       SET enabled = false, limit_value = 0, updated_at = now()
     WHERE workspace_id = _workspace_id;
    RETURN;
  END IF;

  SELECT limits_json INTO v_limits FROM public.plans WHERE id = _plan_id;
  IF v_limits IS NULL THEN
    v_limits := '{}'::jsonb;
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(v_limits) LOOP
    BEGIN
      v_int := NULLIF(v::text, 'null')::int;
    EXCEPTION WHEN others THEN
      v_int := NULL;
    END;
    v_enabled := COALESCE(v_int, 1) <> 0;

    INSERT INTO public.workspace_entitlements(workspace_id, feature_key, enabled, limit_value)
    VALUES (_workspace_id, k, v_enabled, v_int)
    ON CONFLICT (workspace_id, feature_key)
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      limit_value = EXCLUDED.limit_value,
      updated_at = now();
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- billing_close_expired_cancellations: encerra assinaturas vencidas
-- Faz fallback para plano 'free' quando existir; senão, desabilita features.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_close_expired_cancellations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  v_free_id uuid;
  v_count integer := 0;
BEGIN
  SELECT id INTO v_free_id FROM public.plans WHERE code = 'free' AND is_active = true LIMIT 1;

  FOR rec IN
    SELECT id, workspace_id
    FROM public.workspace_subscriptions
    WHERE cancel_at_period_end = true
      AND current_period_end IS NOT NULL
      AND current_period_end < now()
      AND status NOT IN ('canceled')
  LOOP
    UPDATE public.workspace_subscriptions
       SET status = 'canceled',
           canceled_at = COALESCE(canceled_at, now()),
           plan_id = v_free_id,
           cancel_at_period_end = false,
           updated_at = now()
     WHERE id = rec.id;

    PERFORM public.billing_sync_entitlements(rec.workspace_id, v_free_id);

    PERFORM public.billing_record_event(
      rec.workspace_id, rec.id, 'mock', 'subscription.canceled',
      jsonb_build_object('reason', 'period_ended', 'fell_back_to_plan_id', v_free_id),
      NULL
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
