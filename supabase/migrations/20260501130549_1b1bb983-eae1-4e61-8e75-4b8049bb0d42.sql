CREATE OR REPLACE FUNCTION public.billing_dunning_extend_grace(_case_id uuid, _additional_days integer, _reason text)
 RETURNS billing_dunning_cases
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.billing_dunning_cases;
BEGIN
  SELECT * INTO c FROM public.billing_dunning_cases WHERE id = _case_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'dunning case not found'; END IF;
  IF NOT (public.is_workspace_admin(c.workspace_id, auth.uid()) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only workspace admins or platform admins can extend grace';
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
$function$;

CREATE OR REPLACE FUNCTION public.billing_dunning_cancel_for_nonpayment(_case_id uuid, _reason text)
 RETURNS billing_dunning_cases
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c public.billing_dunning_cases;
  v_free_id uuid;
BEGIN
  SELECT * INTO c FROM public.billing_dunning_cases WHERE id = _case_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'dunning case not found'; END IF;
  IF NOT (public.is_workspace_admin(c.workspace_id, auth.uid()) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only workspace admins or platform admins can cancel for non-payment';
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
$function$;