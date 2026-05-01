CREATE OR REPLACE FUNCTION public._seed_homolog_run(p_reset boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid; v_manager_id uuid; v_member_id uuid;
  v_platform_id uuid; v_finance_id uuid; v_support_id uuid; v_security_id uuid;
  v_plan_free uuid; v_plan_pro uuid; v_plan_biz uuid;
  v_ws_count int := 0; v_user_count int := 0; v_task_count int := 0;
  v_inv_count int := 0; v_dun_count int := 0; v_evt_count int := 0;
  v_i int; v_j int;
  v_synth_users uuid[] := ARRAY[]::uuid[];
  v_synth_id uuid; v_synth_email text; v_synth_name text;
  v_first_names text[] := ARRAY['Ana','Bruno','Carla','Diego','Elaine','Felipe','Giovanna','Henrique','Isabel','João','Karina','Leandro','Mariana','Nicolas','Olívia','Paulo','Quésia','Rafael','Sabrina','Thiago','Ursula','Vinícius','Wagner','Xênia','Yasmin','Zeca','Aline','Bernardo','Cecília','Daniela'];
  v_last_names text[] := ARRAY['Silva','Souza','Costa','Lima','Pereira','Rodrigues','Almeida','Nascimento','Carvalho','Gomes','Martins','Araujo','Ribeiro','Ferreira','Rocha','Dias','Teixeira','Mendes','Barbosa','Castro'];
  v_company_pre text[] := ARRAY['Acme','Nova','Atlas','Lumen','Mosaico','Rota','Vértice','Plano','Forge','Helix','Polar','Tetra','Nimbus','Quantum','Solaris','Boreal','Brisa','Trama','Cosmo','Órion'];
  v_company_suf text[] := ARRAY['Tech','Labs','Studio','Group','Digital','Ventures','Brasil','Solutions','Works','Co.','Sistemas','Mídia'];
  v_doc_titles text[] := ARRAY['Visão de Produto 2026','RFC – Nova arquitetura billing','Runbook de incidentes','Manual de boas práticas','Onboarding de novos engenheiros','Roadmap trimestral','Política de segurança','Notas da reunião executiva'];
  v_goal_titles text[] := ARRAY['Aumentar MRR em 20%','Reduzir churn para 3%','Lançar módulo de Docs','NPS acima de 60','Migrar 80% dos clientes para Pro','Reduzir tempo de resposta','Cobertura de testes 85%'];
  v_auto_names text[] := ARRAY['Atribuir automaticamente ao gestor','Notificar quando atrasar','Mover para revisão ao concluir','Marcar urgente após 3 dias','Avisar Slack ao concluir épico'];
  v_ws_id uuid; v_ws_name text; v_ws_slug text; v_ws_owner uuid; v_ws_scenario text;
  v_ws_plan uuid; v_ws_members uuid[];
  v_team_id uuid; v_doc_id uuid; v_goal_id uuid;
  v_sub_id uuid; v_inv_id uuid; v_inv_status text; v_dun_id uuid;
  c_total_ws int := 12; c_synth_users int := 43;
  c_invoices_min int := 6; c_invoices_max int := 12;
BEGIN
  IF p_reset THEN PERFORM public._seed_homolog_reset(); END IF;
  PERFORM public._seed_homolog_ensure_plans();
  PERFORM public._seed_homolog_users();

  SELECT id INTO v_owner_id    FROM public.profiles WHERE email='owner@homolog.flow.dev';
  SELECT id INTO v_manager_id  FROM public.profiles WHERE email='manager@homolog.flow.dev';
  SELECT id INTO v_member_id   FROM public.profiles WHERE email='member@homolog.flow.dev';
  SELECT id INTO v_platform_id FROM public.profiles WHERE email='platform.owner@homolog.flow.dev';
  SELECT id INTO v_finance_id  FROM public.profiles WHERE email='finance@homolog.flow.dev';
  SELECT id INTO v_support_id  FROM public.profiles WHERE email='support@homolog.flow.dev';
  SELECT id INTO v_security_id FROM public.profiles WHERE email='security@homolog.flow.dev';

  SELECT id INTO v_plan_free FROM public.plans WHERE code='free';
  SELECT id INTO v_plan_pro  FROM public.plans WHERE code='pro';
  SELECT id INTO v_plan_biz  FROM public.plans WHERE code='business';

  FOR v_i IN 1..c_synth_users LOOP
    v_synth_id := gen_random_uuid();
    v_synth_email := 'synth' || v_i || '@homolog.flow.dev';
    v_synth_name := v_first_names[1 + (v_i % array_length(v_first_names,1))] || ' ' || v_last_names[1 + ((v_i*3) % array_length(v_last_names,1))];

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES ('00000000-0000-0000-0000-000000000000', v_synth_id, 'authenticated', 'authenticated', v_synth_email, NULL, now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('display_name', v_synth_name, 'seed','homolog-synth'),
      now(), now(), '', '', '', '') ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, display_name, email, is_platform_admin)
    VALUES (v_synth_id, v_synth_name, v_synth_email, false) ON CONFLICT (id) DO NOTHING;

    v_synth_users := array_append(v_synth_users, v_synth_id);
    v_user_count := v_user_count + 1;
  END LOOP;

  FOR v_i IN 1..c_total_ws LOOP
    v_ws_id := gen_random_uuid();
    v_ws_name := v_company_pre[1 + (v_i % array_length(v_company_pre,1))] || ' ' || v_company_suf[1 + ((v_i*2) % array_length(v_company_suf,1))];
    v_ws_slug := lower(regexp_replace(v_ws_name,'[^a-zA-Z0-9]+','-','g')) || '-' || v_i;
    v_ws_scenario := CASE WHEN v_i = 1 THEN 'enterprise' WHEN v_i % 7 = 0 THEN 'canceled' WHEN v_i % 5 = 0 THEN 'past_due' WHEN v_i % 4 = 0 THEN 'growing' ELSE 'healthy' END;
    IF v_i = 1 THEN v_ws_owner := v_owner_id; ELSE v_ws_owner := v_synth_users[1 + (v_i % array_length(v_synth_users,1))]; END IF;

    INSERT INTO public.workspaces (id, name, slug, owner_id, is_suspended, suspended_reason, suspended_at, created_at, updated_at)
    VALUES (v_ws_id, v_ws_name, v_ws_slug, v_ws_owner,
      v_ws_scenario = 'canceled',
      CASE WHEN v_ws_scenario='canceled' THEN 'cancelamento por inadimplência' END,
      CASE WHEN v_ws_scenario='canceled' THEN now() - interval '20 days' END,
      now() - ((20 + (v_i*7)) || ' days')::interval,
      now() - ((random()*7)::int || ' days')::interval);
    v_ws_count := v_ws_count + 1;

    v_ws_members := ARRAY[v_ws_owner];
    INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role)
    VALUES (v_ws_id, v_ws_owner, 'admin'::workspace_role, 'admin'::org_role) ON CONFLICT (workspace_id, user_id) DO NOTHING;

    IF v_i = 1 THEN
      INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role) VALUES
        (v_ws_id, v_manager_id, 'gestor'::workspace_role, 'gestor'::org_role),
        (v_ws_id, v_member_id,  'member'::workspace_role, 'member'::org_role) ON CONFLICT DO NOTHING;
      v_ws_members := array_append(v_ws_members, v_manager_id);
      v_ws_members := array_append(v_ws_members, v_member_id);
    END IF;

    FOR v_j IN 1..(4 + ((v_i + 3) % 7)) LOOP
      v_synth_id := v_synth_users[1 + ((v_i*5 + v_j*7) % array_length(v_synth_users,1))];
      IF NOT (v_synth_id = ANY(v_ws_members)) THEN
        INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role)
        VALUES (v_ws_id, v_synth_id,
          (CASE WHEN v_j=1 THEN 'gestor' WHEN v_j%5=0 THEN 'guest' ELSE 'member' END)::workspace_role,
          (CASE WHEN v_j=1 THEN 'gestor' WHEN v_j%5=0 THEN 'member' ELSE 'member' END)::org_role) ON CONFLICT DO NOTHING;
        v_ws_members := array_append(v_ws_members, v_synth_id);
      END IF;
    END LOOP;

    v_team_id := gen_random_uuid();
    INSERT INTO public.teams (id, workspace_id, name, description, color, created_by)
    VALUES (v_team_id, v_ws_id, 'Time Principal', 'Equipe padrão do workspace', '#3b82f6', v_ws_owner);

    FOR v_j IN 1..2 LOOP
      v_doc_id := gen_random_uuid();
      INSERT INTO public.docs (id, workspace_id, title, content_text, is_published, created_by, last_edited_by, position)
      VALUES (v_doc_id, v_ws_id,
        v_doc_titles[1 + ((v_i + v_j) % array_length(v_doc_titles,1))],
        'Documento de referência para o time. Última atualização em homologação.',
        v_j = 1, v_ws_owner, v_ws_owner, v_j);
    END LOOP;

    FOR v_j IN 1..2 LOOP
      v_goal_id := gen_random_uuid();
      INSERT INTO public.goals (id, workspace_id, name, description, color, owner_id, start_date, due_date, created_by)
      VALUES (v_goal_id, v_ws_id,
        v_goal_titles[1 + ((v_i + v_j) % array_length(v_goal_titles,1))],
        'Objetivo estratégico para o trimestre.', '#7c3aed', v_ws_owner,
        (current_date - interval '60 days')::date, (current_date + interval '30 days')::date, v_ws_owner);
      INSERT INTO public.goal_targets (goal_id, workspace_id, name, target_type, initial_value, current_value, target_value, position)
      VALUES (v_goal_id, v_ws_id, 'Métrica principal', 'percentage'::goal_target_type, 0, (random()*100)::int, 100, 0);
    END LOOP;

    FOR v_j IN 1..2 LOOP
      INSERT INTO public.automations (workspace_id, name, is_active, trigger, trigger_config, actions, conditions, created_by, run_count, last_run_at)
      VALUES (v_ws_id, v_auto_names[1 + ((v_i + v_j) % array_length(v_auto_names,1))],
        true, 'task_created'::automation_trigger, '{}'::jsonb,
        jsonb_build_array(jsonb_build_object('type','assign','user_id', v_ws_owner)),
        '[]'::jsonb, v_ws_owner, (random()*30)::int, now() - ((random()*15)::int || ' days')::interval);
    END LOOP;

    v_ws_plan := CASE WHEN v_ws_scenario IN ('enterprise','growing') THEN v_plan_biz
      WHEN v_ws_scenario IN ('past_due','canceled') THEN v_plan_pro
      ELSE (ARRAY[v_plan_free, v_plan_pro, v_plan_pro, v_plan_biz])[1 + (v_i % 4)] END;

    v_sub_id := gen_random_uuid();
    INSERT INTO public.workspace_subscriptions (id, workspace_id, plan_id, status, billing_provider, provider_customer_id, provider_subscription_id, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, canceled_at)
    VALUES (v_sub_id, v_ws_id, v_ws_plan,
      CASE v_ws_scenario WHEN 'past_due' THEN 'past_due' WHEN 'canceled' THEN 'canceled' WHEN 'growing' THEN 'trialing' ELSE 'active' END,
      'mock', 'cus_seed_' || v_i, 'sub_seed_' || v_i,
      CASE WHEN v_ws_scenario='growing' THEN now() + interval '5 days' END,
      date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
      v_ws_scenario='canceled', CASE WHEN v_ws_scenario='canceled' THEN now() - interval '15 days' END)
    ON CONFLICT (workspace_id) DO UPDATE SET status = EXCLUDED.status RETURNING id INTO v_sub_id;

    FOR v_j IN 1..(c_invoices_min + (v_i % (c_invoices_max - c_invoices_min + 1))) LOOP
      v_inv_id := gen_random_uuid();
      v_inv_status := CASE
        WHEN v_ws_scenario='past_due' AND v_j <= 2 THEN 'open'
        WHEN v_ws_scenario='canceled' AND v_j <= 1 THEN 'uncollectible'
        WHEN v_j % 11 = 0 THEN 'void'
        WHEN v_j % 7 = 0  THEN 'open'
        ELSE 'paid' END;

      INSERT INTO public.workspace_invoices (id, workspace_id, subscription_id, provider_invoice_id, amount_due_cents, amount_paid_cents, currency, status, due_at, paid_at, hosted_invoice_url, created_at, updated_at)
      VALUES (v_inv_id, v_ws_id, v_sub_id, 'in_seed_' || v_i || '_' || v_j,
        (CASE WHEN v_ws_plan=v_plan_biz THEN 29900 WHEN v_ws_plan=v_plan_pro THEN 9900 ELSE 0 END),
        CASE WHEN v_inv_status='paid' THEN (CASE WHEN v_ws_plan=v_plan_biz THEN 29900 WHEN v_ws_plan=v_plan_pro THEN 9900 ELSE 0 END) ELSE 0 END,
        'BRL', v_inv_status,
        now() - ((v_j*30) || ' days')::interval,
        CASE WHEN v_inv_status='paid' THEN now() - ((v_j*30 - 2) || ' days')::interval END,
        'https://invoices.example.com/' || v_inv_id,
        now() - ((v_j*30 + 3) || ' days')::interval,
        now() - ((v_j*30) || ' days')::interval);
      v_inv_count := v_inv_count + 1;

      IF v_inv_status = 'open' AND v_ws_scenario IN ('past_due','canceled') AND v_j <= 2 THEN
        v_dun_id := gen_random_uuid();
        INSERT INTO public.billing_dunning_cases (id, workspace_id, subscription_id, invoice_id, status, retry_count, next_retry_at, grace_ends_at, reason, metadata, closed_at)
        VALUES (v_dun_id, v_ws_id, v_sub_id, v_inv_id,
          CASE WHEN v_ws_scenario='canceled' THEN 'exhausted' ELSE 'open' END,
          1 + (v_j % 3),
          CASE WHEN v_ws_scenario<>'canceled' THEN now() + interval '2 days' END,
          now() + interval '7 days', 'payment_failed', jsonb_build_object('seed', true),
          CASE WHEN v_ws_scenario='canceled' THEN now() - interval '5 days' END);
        INSERT INTO public.billing_dunning_attempts (dunning_case_id, workspace_id, attempt_number, result, reason, attempted_at)
        VALUES
          (v_dun_id, v_ws_id, 1, 'failed', 'card_declined', now() - interval '6 days'),
          (v_dun_id, v_ws_id, 2, CASE WHEN v_ws_scenario='canceled' THEN 'failed' ELSE 'skipped' END, 'retry_scheduled', now() - interval '3 days');
        v_dun_count := v_dun_count + 1;
      END IF;

      INSERT INTO public.billing_events (workspace_id, subscription_id, provider, provider_event_id, event_type, payload, processed, processed_at)
      VALUES
        (v_ws_id, v_sub_id, 'mock', 'evt_' || v_inv_id || '_created', 'invoice.created',
         jsonb_build_object('invoice_id', v_inv_id, 'amount_cents', CASE WHEN v_ws_plan=v_plan_biz THEN 29900 WHEN v_ws_plan=v_plan_pro THEN 9900 ELSE 0 END),
         true, now() - ((v_j*30 + 2) || ' days')::interval),
        (v_ws_id, v_sub_id, 'mock', 'evt_' || v_inv_id || '_status', 'invoice.' || v_inv_status,
         jsonb_build_object('invoice_id', v_inv_id, 'status', v_inv_status), true, now() - ((v_j*30) || ' days')::interval);
      v_evt_count := v_evt_count + 2;
    END LOOP;

    INSERT INTO public.workspace_entitlements (workspace_id, feature_key, enabled, limit_value, current_usage)
    VALUES
      (v_ws_id, 'tasks',   true, (CASE WHEN v_ws_plan=v_plan_biz THEN 100000 WHEN v_ws_plan=v_plan_pro THEN 10000 ELSE 500 END),
        (CASE v_ws_scenario WHEN 'enterprise' THEN 60000 WHEN 'growing' THEN 9000 WHEN 'past_due' THEN 11000 ELSE 200 END)),
      (v_ws_id, 'members', true, (CASE WHEN v_ws_plan=v_plan_biz THEN 100 WHEN v_ws_plan=v_plan_pro THEN 25 ELSE 5 END),
        array_length(v_ws_members,1)),
      (v_ws_id, 'storage_mb', true, (CASE WHEN v_ws_plan=v_plan_biz THEN 102400 WHEN v_ws_plan=v_plan_pro THEN 10240 ELSE 500 END),
        (CASE v_ws_scenario WHEN 'enterprise' THEN 80000 WHEN 'growing' THEN 8500 WHEN 'past_due' THEN 12000 ELSE 120 END));

    INSERT INTO public.audit_logs (workspace_id, actor_id, actor_email, action, entity_type, entity_id, metadata, ip_address)
    VALUES
      (v_ws_id, v_ws_owner, 'owner@homolog.flow.dev', 'workspace.created', 'workspace', v_ws_id, jsonb_build_object('seed',true), '127.0.0.1'),
      (v_ws_id, v_ws_owner, 'owner@homolog.flow.dev', 'subscription.activated', 'subscription', v_sub_id, jsonb_build_object('plan', v_ws_scenario), '127.0.0.1');

    IF v_ws_scenario = 'past_due' THEN
      INSERT INTO public.platform_reconciliation_log (workspace_id, kind, validator, severity, entity_type, entity_id, details, reason)
      VALUES (v_ws_id, 'scan', 'invoice_paid_subscription_past_due', 'warning', 'subscription', v_sub_id::text,
        jsonb_build_object('explanation','Pagamento confirmado mas assinatura ainda em past_due'),
        'Reconciliação automática');
    END IF;
  END LOOP;

  INSERT INTO public.platform_admin_alerts (severity, kind, title, details, status)
  VALUES
    ('warning', 'past_due_spike', 'Spike de past_due detectado', jsonb_build_object('current_pct', 0.06, 'threshold', 0.05), 'open'),
    ('critical','mutation_failure_rate', 'Falhas elevadas em mutações administrativas', jsonb_build_object('per_hour', 4, 'threshold', 3), 'acknowledged'),
    ('info',    'churn_30d', 'Churn 30 dias dentro da meta', jsonb_build_object('current_pct', 0.04), 'resolved');

  INSERT INTO public.platform_admin_sessions (user_id, email, ip, user_agent, started_at, last_seen_at)
  VALUES
    (v_platform_id, 'platform.owner@homolog.flow.dev', '127.0.0.1', 'Mozilla/5.0 (seed)', now() - interval '2 hours', now() - interval '5 minutes'),
    (v_security_id, 'security@homolog.flow.dev',       '127.0.0.1', 'Mozilla/5.0 (seed)', now() - interval '1 day', now() - interval '23 hours');

  INSERT INTO public.platform_admin_actions_log (admin_user_id, email, event, route, ip, metadata)
  SELECT v_platform_id, 'platform.owner@homolog.flow.dev',
    (ARRAY['login','view_clients','view_finance','view_metrics','export_csv'])[1 + (g % 5)],
    '/admin', '127.0.0.1', jsonb_build_object('seed', true)
  FROM generate_series(1, 25) g;

  RETURN jsonb_build_object('workspaces', v_ws_count, 'synthetic_users', v_user_count, 'tasks', v_task_count, 'invoices', v_inv_count, 'dunning_cases', v_dun_count, 'billing_events', v_evt_count);
END;
$function$;