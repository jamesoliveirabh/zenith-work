-- =============================================================================
-- HOMOLOGATION SEED SUITE
-- Idempotent functions to (re)create rich mock data for QA/demos.
-- Tables touched are protected by RLS — these functions are SECURITY DEFINER.
-- =============================================================================

-- Ensure pgcrypto is available for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- helper: ensure baseline plans exist ----------
CREATE OR REPLACE FUNCTION public._seed_homolog_ensure_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.plans (code, name, description, price_cents, currency, interval, limits_json, is_active)
  VALUES
    ('free',     'Free',     'Plano gratuito para times pequenos',     0,      'BRL', 'month', '{"members":5,"tasks":500,"storage_mb":500}', true),
    ('pro',      'Pro',      'Plano profissional para times em crescimento', 9900,  'BRL', 'month', '{"members":25,"tasks":10000,"storage_mb":10240}', true),
    ('business', 'Business', 'Plano corporativo com automações avançadas',   29900, 'BRL', 'month', '{"members":100,"tasks":100000,"storage_mb":102400}', true)
  ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_cents = EXCLUDED.price_cents,
        limits_json = EXCLUDED.limits_json,
        is_active = true;
END;
$fn$;

-- ---------- 1) Ensure 7 logable users exist in auth.users ----------
CREATE OR REPLACE FUNCTION public._seed_homolog_users()
RETURNS TABLE(label text, email text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $fn$
DECLARE
  v_pwd_hash text := crypt('Homolog@2026', gen_salt('bf'));
  v_users    jsonb := jsonb_build_array(
    jsonb_build_object('label','owner',         'email','owner@homolog.flow.dev',         'name','Olivia Owner'),
    jsonb_build_object('label','manager',       'email','manager@homolog.flow.dev',       'name','Marcos Manager'),
    jsonb_build_object('label','member',        'email','member@homolog.flow.dev',        'name','Marina Member'),
    jsonb_build_object('label','platform_owner','email','platform.owner@homolog.flow.dev','name','Pedro Platform'),
    jsonb_build_object('label','finance_admin', 'email','finance@homolog.flow.dev',       'name','Fabiana Finance'),
    jsonb_build_object('label','support_admin', 'email','support@homolog.flow.dev',       'name','Sofia Support'),
    jsonb_build_object('label','security_admin','email','security@homolog.flow.dev',      'name','Sergio Security')
  );
  v_rec  jsonb;
  v_uid  uuid;
  v_role text;
BEGIN
  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_users)
  LOOP
    SELECT id INTO v_uid FROM auth.users WHERE email = v_rec->>'email';

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_rec->>'email',
        v_pwd_hash, now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
        jsonb_build_object('display_name', v_rec->>'name', 'seed','homolog'),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), v_uid, v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', v_rec->>'email'),
        'email', now(), now(), now()
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- profile (in case trigger didn't fire or row missing)
    INSERT INTO public.profiles (id, display_name, email, is_platform_admin)
    VALUES (
      v_uid,
      v_rec->>'name',
      v_rec->>'email',
      (v_rec->>'label') IN ('platform_owner','finance_admin','support_admin','security_admin')
    )
    ON CONFLICT (id) DO UPDATE
      SET display_name      = EXCLUDED.display_name,
          email             = EXCLUDED.email,
          is_platform_admin = EXCLUDED.is_platform_admin;

    -- platform admin role for backoffice users
    v_role := v_rec->>'label';
    IF v_role IN ('platform_owner','finance_admin','support_admin','security_admin') THEN
      INSERT INTO public.platform_admin_roles (user_id, role, is_active, granted_reason)
      VALUES (v_uid, v_role::platform_admin_role, true, 'seed:homolog')
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_rec->>'label', v_rec->>'email', v_uid;
  END LOOP;
END;
$fn$;

-- ---------- 2) Reset domain data (preserve catalogs and auth) ----------
CREATE OR REPLACE FUNCTION public._seed_homolog_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Order respects logical references (no FKs declared, but keep coherent)
  TRUNCATE TABLE
    public.platform_admin_actions_log,
    public.platform_admin_sessions,
    public.platform_admin_alerts,
    public.platform_admin_exports_log,
    public.platform_reconciliation_log,
    public.workspace_admin_notes,
    public.admin_actions_log,
    public.audit_logs,
    public.activity_logs,
    public.notifications,
    public.automation_runs,
    public.automations,
    public.dashboard_widget_configs,
    public.time_entries,
    public.task_relations,
    public.task_watchers,
    public.task_field_values,
    public.task_attachments,
    public.task_comments,
    public.task_assignees,
    public.tasks,
    public.status_columns,
    public.list_role_permissions,
    public.list_permissions,
    public.list_views,
    public.lists,
    public.space_memberships,
    public.spaces,
    public.team_memberships,
    public.teams,
    public.custom_fields,
    public.doc_task_links,
    public.doc_members,
    public.docs,
    public.goal_targets,
    public.goal_members,
    public.goals,
    public.role_permissions,
    public.workspace_invitations,
    public.workspace_entitlements,
    public.billing_dunning_attempts,
    public.billing_dunning_cases,
    public.billing_email_outbox,
    public.billing_enforcement_overrides,
    public.billing_enforcement_logs,
    public.billing_events,
    public.workspace_invoices,
    public.workspace_subscriptions,
    public.workspace_members,
    public.workspaces
  RESTART IDENTITY CASCADE;
END;
$fn$;

-- ---------- 3) Main seed orchestrator ----------
CREATE OR REPLACE FUNCTION public._seed_homolog_run(p_reset boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- target users (logable)
  v_owner_id    uuid;
  v_manager_id  uuid;
  v_member_id   uuid;
  v_platform_id uuid;
  v_finance_id  uuid;
  v_support_id  uuid;
  v_security_id uuid;

  -- plans
  v_plan_free  uuid;
  v_plan_pro   uuid;
  v_plan_biz   uuid;

  -- counters / loops
  v_ws_count   int := 0;
  v_user_count int := 0;
  v_task_count int := 0;
  v_inv_count  int := 0;
  v_dun_count  int := 0;
  v_evt_count  int := 0;

  -- iteration vars
  v_i           int;
  v_j           int;
  v_k           int;
  v_synth_users uuid[] := ARRAY[]::uuid[];
  v_synth_id    uuid;
  v_first_names text[] := ARRAY['Ana','Bruno','Carla','Diego','Elaine','Felipe','Giovanna','Henrique','Isabel','João','Karina','Leandro','Mariana','Nicolas','Olívia','Paulo','Quésia','Rafael','Sabrina','Thiago','Ursula','Vinícius','Wagner','Xênia','Yasmin','Zeca','Aline','Bernardo','Cecília','Daniela'];
  v_last_names  text[] := ARRAY['Silva','Souza','Costa','Lima','Pereira','Rodrigues','Almeida','Nascimento','Carvalho','Gomes','Martins','Araujo','Ribeiro','Ferreira','Rocha','Dias','Teixeira','Mendes','Barbosa','Castro'];
  v_company_pre text[] := ARRAY['Acme','Nova','Atlas','Lumen','Mosaico','Rota','Vértice','Plano','Forge','Helix','Polar','Tetra','Nimbus','Quantum','Solaris','Boreal','Brisa','Trama','Cosmo','Órion'];
  v_company_suf text[] := ARRAY['Tech','Labs','Studio','Group','Digital','Ventures','Brasil','Solutions','Works','Co.','Sistemas','Mídia'];
  v_space_names text[] := ARRAY['Produto','Engenharia','Marketing','Vendas','RH','Operações','Financeiro','Suporte','Design','Dados'];
  v_list_names  text[] := ARRAY['Backlog','Sprint Atual','Em Revisão','Roadmap Q','Bugs Críticos','Iniciativas','Pendências','Lançamento'];
  v_status_set  jsonb  := jsonb_build_array(
    jsonb_build_object('name','A fazer','color','#94a3b8','done',false),
    jsonb_build_object('name','Em progresso','color','#3b82f6','done',false),
    jsonb_build_object('name','Em revisão','color','#f59e0b','done',false),
    jsonb_build_object('name','Concluído','color','#10b981','done',true)
  );
  v_priorities  text[] := ARRAY['low','medium','medium','high','high','urgent'];
  v_task_titles text[] := ARRAY[
    'Revisar fluxo de onboarding','Atualizar landing page','Corrigir bug no kanban','Sincronizar com cliente','Refatorar serviço de billing',
    'Criar campanha de retenção','Documentar API pública','Investigar erro 500','Planejar release','Migrar database de staging',
    'Treinar time de suporte','Definir KPIs do trimestre','Revisar contrato de SLA','Otimizar consulta SQL lenta','Preparar demo executiva',
    'Atualizar política de senhas','Mapear jornada de churn','Configurar alerta de uptime','Reduzir tempo de build','Limpar débito técnico'
  ];
  v_doc_titles  text[] := ARRAY['Visão de Produto 2026','RFC – Nova arquitetura billing','Runbook de incidentes','Manual de boas práticas','Onboarding de novos engenheiros','Roadmap trimestral','Política de segurança','Notas da reunião executiva'];
  v_goal_titles text[] := ARRAY['Aumentar MRR em 20%','Reduzir churn para 3%','Lançar módulo de Docs','NPS acima de 60','Migrar 80% dos clientes para Pro','Reduzir tempo de resposta','Cobertura de testes 85%'];
  v_auto_names  text[] := ARRAY['Atribuir automaticamente ao gestor','Notificar quando atrasar','Mover para revisão ao concluir','Marcar urgente após 3 dias','Avisar Slack ao concluir épico'];
  v_comment_seeds text[] := ARRAY[
    'Acabei de revisar, parece ok pra mim.','Pode subir após o code review.','Bloqueado pelo time de infra, aguardando.','Atualizei o escopo, dá uma olhada?',
    'Cliente confirmou a entrega para sexta.','Vou puxar essa em paralelo.','Falta apenas a documentação.','Reabri porque achei um regressão.',
    'Movendo para o próximo sprint.','Excelente trabalho aqui!','Precisamos alinhar com o time financeiro.','Conversei com o owner, segue assim.'
  ];

  -- workspace iteration vars
  v_ws_id        uuid;
  v_ws_name      text;
  v_ws_slug      text;
  v_ws_owner     uuid;
  v_ws_scenario  text;     -- healthy | growing | past_due | canceled | enterprise
  v_ws_plan      uuid;
  v_ws_members   uuid[];
  v_team_id      uuid;
  v_space_id     uuid;
  v_list_id      uuid;
  v_status_id    uuid;
  v_status_done  uuid;
  v_status_first uuid;
  v_task_id      uuid;
  v_doc_id       uuid;
  v_goal_id      uuid;
  v_assignee     uuid;
  v_author       uuid;
  v_sub_id       uuid;
  v_inv_id       uuid;
  v_inv_status   text;
  v_dun_id       uuid;
  v_t            timestamptz;
  v_status_ids   uuid[];

  -- light-mode volume
  c_total_ws        int := 12;
  c_synth_users     int := 43;
  c_spaces_per_ws   int := 3;
  c_lists_per_space int := 3;
  c_tasks_per_list  int := 22;
  c_invoices_min    int := 6;
  c_invoices_max    int := 12;
BEGIN
  IF p_reset THEN
    PERFORM public._seed_homolog_reset();
  END IF;

  PERFORM public._seed_homolog_ensure_plans();
  PERFORM public._seed_homolog_users();

  -- Resolve canonical user ids
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

  -- ---------- Synthetic profiles (no auth.users) ----------
  FOR v_i IN 1..c_synth_users LOOP
    v_synth_id := gen_random_uuid();
    INSERT INTO public.profiles (id, display_name, email, is_platform_admin)
    VALUES (
      v_synth_id,
      v_first_names[1 + (v_i % array_length(v_first_names,1))] || ' ' ||
      v_last_names[1 + ((v_i*3) % array_length(v_last_names,1))],
      'synth' || v_i || '@homolog.flow.dev',
      false
    );
    v_synth_users := array_append(v_synth_users, v_synth_id);
    v_user_count := v_user_count + 1;
  END LOOP;

  -- ---------- Workspaces ----------
  FOR v_i IN 1..c_total_ws LOOP
    v_ws_id   := gen_random_uuid();
    v_ws_name := v_company_pre[1 + (v_i % array_length(v_company_pre,1))]
              || ' ' ||
              v_company_suf[1 + ((v_i*2) % array_length(v_company_suf,1))];
    v_ws_slug := lower(regexp_replace(v_ws_name,'[^a-zA-Z0-9]+','-','g')) || '-' || v_i;

    -- Decide scenario distribution (~60/15/15/5/5)
    v_ws_scenario := CASE
      WHEN v_i = 1 THEN 'enterprise'   -- the showcase one (owns the test owner)
      WHEN v_i % 7 = 0 THEN 'canceled'
      WHEN v_i % 5 = 0 THEN 'past_due'
      WHEN v_i % 4 = 0 THEN 'growing'
      ELSE 'healthy'
    END;

    -- Owner: workspace #1 belongs to the test owner; others rotate
    IF v_i = 1 THEN
      v_ws_owner := v_owner_id;
    ELSE
      v_ws_owner := v_synth_users[1 + (v_i % array_length(v_synth_users,1))];
    END IF;

    INSERT INTO public.workspaces (id, name, slug, owner_id, is_suspended, suspended_reason, suspended_at, created_at, updated_at)
    VALUES (
      v_ws_id, v_ws_name, v_ws_slug, v_ws_owner,
      v_ws_scenario = 'canceled',
      CASE WHEN v_ws_scenario='canceled' THEN 'cancelamento por inadimplência' END,
      CASE WHEN v_ws_scenario='canceled' THEN now() - interval '20 days' END,
      now() - ((20 + (v_i*7)) || ' days')::interval,
      now() - ((random()*7)::int || ' days')::interval
    );
    v_ws_count := v_ws_count + 1;

    -- ---------- Members (always include owner + manager/member on ws #1) ----------
    v_ws_members := ARRAY[v_ws_owner];

    INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role)
    VALUES (v_ws_id, v_ws_owner, 'admin'::workspace_role, 'admin'::org_role);

    IF v_i = 1 THEN
      INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role) VALUES
        (v_ws_id, v_manager_id, 'gestor'::workspace_role, 'gestor'::org_role),
        (v_ws_id, v_member_id,  'member'::workspace_role, 'member'::org_role)
      ON CONFLICT DO NOTHING;
      v_ws_members := array_append(v_ws_members, v_manager_id);
      v_ws_members := array_append(v_ws_members, v_member_id);
    END IF;

    -- Add 4–10 random synth members
    FOR v_j IN 1..(4 + ((v_i + 3) % 7)) LOOP
      v_synth_id := v_synth_users[1 + ((v_i*5 + v_j*7) % array_length(v_synth_users,1))];
      IF NOT (v_synth_id = ANY(v_ws_members)) THEN
        INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role)
        VALUES (v_ws_id, v_synth_id,
          (CASE WHEN v_j=1 THEN 'gestor' WHEN v_j%5=0 THEN 'guest' ELSE 'member' END)::workspace_role,
          (CASE WHEN v_j=1 THEN 'gestor' WHEN v_j%5=0 THEN 'member' ELSE 'member' END)::org_role
        ) ON CONFLICT DO NOTHING;
        v_ws_members := array_append(v_ws_members, v_synth_id);
      END IF;
    END LOOP;

    -- ---------- Team (1) ----------
    v_team_id := gen_random_uuid();
    INSERT INTO public.teams (id, workspace_id, name, description, color, created_by)
    VALUES (v_team_id, v_ws_id, 'Time Principal', 'Equipe padrão do workspace', '#6366f1', v_ws_owner);
    INSERT INTO public.team_memberships (team_id, workspace_id, user_id, role)
    SELECT v_team_id, v_ws_id, u, 'member'::team_role FROM unnest(v_ws_members) u
    ON CONFLICT DO NOTHING;

    -- ---------- Spaces & Lists & Status & Tasks ----------
    FOR v_j IN 1..c_spaces_per_ws LOOP
      v_space_id := gen_random_uuid();
      INSERT INTO public.spaces (id, workspace_id, team_id, name, color, icon, position, created_by)
      VALUES (
        v_space_id, v_ws_id, v_team_id,
        v_space_names[1 + ((v_i + v_j) % array_length(v_space_names,1))],
        '#6366f1', 'folder', v_j, v_ws_owner
      );
      INSERT INTO public.space_memberships (space_id, team_id, workspace_id, user_id)
      SELECT v_space_id, v_team_id, v_ws_id, u FROM unnest(v_ws_members) u
      ON CONFLICT DO NOTHING;

      FOR v_k IN 1..c_lists_per_space LOOP
        v_list_id := gen_random_uuid();
        INSERT INTO public.lists (id, space_id, workspace_id, name, color, position, created_by)
        VALUES (
          v_list_id, v_space_id, v_ws_id,
          v_list_names[1 + ((v_j*v_k) % array_length(v_list_names,1))],
          '#64748b', v_k, v_ws_owner
        );

        -- Status columns
        v_status_ids := ARRAY[]::uuid[];
        FOR v_status_id IN
          SELECT gen_random_uuid() FROM generate_series(1, jsonb_array_length(v_status_set))
        LOOP
          v_status_ids := array_append(v_status_ids, v_status_id);
        END LOOP;
        FOR v_k IN 1..jsonb_array_length(v_status_set) LOOP
          INSERT INTO public.status_columns (id, list_id, workspace_id, name, color, position, is_done)
          VALUES (
            v_status_ids[v_k], v_list_id, v_ws_id,
            v_status_set->(v_k-1)->>'name',
            v_status_set->(v_k-1)->>'color',
            v_k - 1,
            (v_status_set->(v_k-1)->>'done')::boolean
          );
        END LOOP;
        v_status_first := v_status_ids[1];
        v_status_done  := v_status_ids[jsonb_array_length(v_status_set)];

        -- Tasks
        FOR v_k IN 1..c_tasks_per_list LOOP
          v_task_id  := gen_random_uuid();
          v_assignee := v_ws_members[1 + (v_k % array_length(v_ws_members,1))];
          v_status_id := v_status_ids[1 + (v_k % array_length(v_status_ids,1))];
          v_t        := now() - ((random()*330)::int || ' days')::interval;

          INSERT INTO public.tasks (
            id, list_id, workspace_id, status_id, title, priority,
            assignee_id, start_date, due_date, completed_at, position,
            tags, created_by, created_at, updated_at, description_text, time_estimate_seconds
          ) VALUES (
            v_task_id, v_list_id, v_ws_id, v_status_id,
            v_task_titles[1 + (v_k % array_length(v_task_titles,1))] || ' #' || v_k,
            v_priorities[1 + (v_k % array_length(v_priorities,1))]::task_priority,
            v_assignee,
            v_t,
            v_t + ((1 + (v_k % 14)) || ' days')::interval,
            CASE WHEN v_status_id = v_status_done THEN v_t + ((1 + (v_k % 12)) || ' days')::interval END,
            v_k,
            ARRAY['homolog', 'sprint-' || ((v_k % 4) + 1)],
            v_ws_owner, v_t, v_t,
            'Tarefa de homologação gerada automaticamente para validar fluxos.',
            (1800 + (v_k % 12) * 600)
          );
          v_task_count := v_task_count + 1;

          -- assignees side table
          INSERT INTO public.task_assignees (task_id, user_id, workspace_id)
          VALUES (v_task_id, v_assignee, v_ws_id) ON CONFLICT DO NOTHING;

          -- comments (0–3)
          FOR v_status_id IN SELECT generate_series(1, (v_k % 4)) LOOP
            INSERT INTO public.task_comments (task_id, workspace_id, author_id, body, created_at)
            VALUES (
              v_task_id, v_ws_id,
              v_ws_members[1 + ((v_k + v_status_id::int) % array_length(v_ws_members,1))],
              v_comment_seeds[1 + ((v_k * v_status_id::int) % array_length(v_comment_seeds,1))],
              v_t + ((v_status_id::int) || ' hours')::interval
            );
          END LOOP;

          -- activity log entry
          INSERT INTO public.activity_logs (workspace_id, actor_id, action, entity_type, entity_id, entity_title, created_at)
          VALUES (v_ws_id, v_ws_owner, 'task_created', 'task', v_task_id,
            v_task_titles[1 + (v_k % array_length(v_task_titles,1))], v_t);

          -- time entries on ~25% of tasks
          IF v_k % 4 = 0 THEN
            INSERT INTO public.time_entries (task_id, workspace_id, user_id, started_at, ended_at, duration_seconds, note)
            VALUES (v_task_id, v_ws_id, v_assignee, v_t, v_t + interval '90 minutes', 5400, 'Sessão focada');
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;

    -- ---------- Docs (3 per workspace) ----------
    FOR v_j IN 1..3 LOOP
      v_doc_id := gen_random_uuid();
      INSERT INTO public.docs (id, workspace_id, title, content_text, is_published, created_by, last_edited_by, position)
      VALUES (
        v_doc_id, v_ws_id,
        v_doc_titles[1 + ((v_i + v_j) % array_length(v_doc_titles,1))],
        'Documento de referência para o time. Última atualização em homologação.',
        v_j = 1, v_ws_owner, v_ws_owner, v_j
      );
    END LOOP;

    -- ---------- Goals (2 per workspace) ----------
    FOR v_j IN 1..2 LOOP
      v_goal_id := gen_random_uuid();
      INSERT INTO public.goals (id, workspace_id, name, description, color, owner_id, start_date, due_date, created_by)
      VALUES (
        v_goal_id, v_ws_id,
        v_goal_titles[1 + ((v_i + v_j) % array_length(v_goal_titles,1))],
        'Objetivo estratégico para o trimestre.',
        '#7c3aed', v_ws_owner,
        (current_date - interval '60 days')::date,
        (current_date + interval '30 days')::date,
        v_ws_owner
      );
      INSERT INTO public.goal_targets (goal_id, workspace_id, name, target_type, initial_value, current_value, target_value, position)
      VALUES (v_goal_id, v_ws_id, 'Métrica principal', 'percentage'::goal_target_type, 0, (random()*100)::int, 100, 0);
    END LOOP;

    -- ---------- Automations (2 per workspace) ----------
    FOR v_j IN 1..2 LOOP
      INSERT INTO public.automations (workspace_id, name, is_active, trigger, trigger_config, actions, conditions, created_by, run_count, last_run_at)
      VALUES (
        v_ws_id,
        v_auto_names[1 + ((v_i + v_j) % array_length(v_auto_names,1))],
        true, 'task_created'::automation_trigger,
        '{}'::jsonb,
        jsonb_build_array(jsonb_build_object('type','assign','user_id', v_ws_owner)),
        '[]'::jsonb, v_ws_owner,
        (random()*30)::int, now() - ((random()*15)::int || ' days')::interval
      );
    END LOOP;

    -- ---------- Subscription based on scenario ----------
    v_ws_plan := CASE
      WHEN v_ws_scenario IN ('enterprise','growing') THEN v_plan_biz
      WHEN v_ws_scenario = 'past_due' THEN v_plan_pro
      WHEN v_ws_scenario = 'canceled' THEN v_plan_pro
      ELSE (ARRAY[v_plan_free, v_plan_pro, v_plan_pro, v_plan_biz])[1 + (v_i % 4)]
    END;

    v_sub_id := gen_random_uuid();
    INSERT INTO public.workspace_subscriptions (
      id, workspace_id, plan_id, status, billing_provider,
      provider_customer_id, provider_subscription_id,
      trial_ends_at, current_period_start, current_period_end,
      cancel_at_period_end, canceled_at
    ) VALUES (
      v_sub_id, v_ws_id, v_ws_plan,
      CASE v_ws_scenario
        WHEN 'past_due'   THEN 'past_due'
        WHEN 'canceled'   THEN 'canceled'
        WHEN 'growing'    THEN 'trialing'
        ELSE 'active'
      END,
      'mock', 'cus_seed_' || v_i, 'sub_seed_' || v_i,
      CASE WHEN v_ws_scenario='growing' THEN now() + interval '5 days' END,
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month',
      v_ws_scenario='canceled',
      CASE WHEN v_ws_scenario='canceled' THEN now() - interval '15 days' END
    );

    -- ---------- Invoices: backfill 6–12 months ----------
    FOR v_j IN 1..(c_invoices_min + (v_i % (c_invoices_max - c_invoices_min + 1))) LOOP
      v_inv_id := gen_random_uuid();
      v_inv_status := CASE
        WHEN v_ws_scenario='past_due' AND v_j <= 2 THEN 'past_due'
        WHEN v_ws_scenario='canceled' AND v_j <= 1 THEN 'uncollectible'
        WHEN v_j % 11 = 0 THEN 'void'
        WHEN v_j % 7 = 0  THEN 'open'
        ELSE 'paid'
      END;

      INSERT INTO public.workspace_invoices (
        id, workspace_id, subscription_id, provider_invoice_id,
        amount_due_cents, amount_paid_cents, currency, status,
        due_at, paid_at, hosted_invoice_url, created_at, updated_at
      ) VALUES (
        v_inv_id, v_ws_id, v_sub_id, 'in_seed_' || v_i || '_' || v_j,
        (CASE WHEN v_ws_plan=v_plan_biz THEN 29900 WHEN v_ws_plan=v_plan_pro THEN 9900 ELSE 0 END),
        CASE WHEN v_inv_status='paid'
             THEN (CASE WHEN v_ws_plan=v_plan_biz THEN 29900 WHEN v_ws_plan=v_plan_pro THEN 9900 ELSE 0 END)
             ELSE 0 END,
        'BRL', v_inv_status,
        now() - ((v_j*30) || ' days')::interval,
        CASE WHEN v_inv_status='paid' THEN now() - ((v_j*30 - 2) || ' days')::interval END,
        'https://invoices.example.com/' || v_inv_id,
        now() - ((v_j*30 + 3) || ' days')::interval,
        now() - ((v_j*30) || ' days')::interval
      );
      v_inv_count := v_inv_count + 1;

      -- Dunning case for past_due / open invoices on bad scenarios
      IF v_inv_status IN ('past_due','open') AND v_ws_scenario IN ('past_due','canceled') AND v_j <= 2 THEN
        v_dun_id := gen_random_uuid();
        INSERT INTO public.billing_dunning_cases (
          id, workspace_id, subscription_id, invoice_id, status, retry_count,
          next_retry_at, grace_ends_at, reason, metadata, closed_at
        ) VALUES (
          v_dun_id, v_ws_id, v_sub_id, v_inv_id,
          CASE WHEN v_ws_scenario='canceled' THEN 'closed' ELSE 'open' END,
          1 + (v_j % 3),
          CASE WHEN v_ws_scenario<>'canceled' THEN now() + interval '2 days' END,
          now() + interval '7 days',
          'payment_failed',
          jsonb_build_object('seed', true),
          CASE WHEN v_ws_scenario='canceled' THEN now() - interval '5 days' END
        );
        INSERT INTO public.billing_dunning_attempts (dunning_case_id, workspace_id, attempt_number, result, reason, attempted_at)
        VALUES
          (v_dun_id, v_ws_id, 1, 'failed', 'card_declined', now() - interval '6 days'),
          (v_dun_id, v_ws_id, 2, CASE WHEN v_ws_scenario='canceled' THEN 'failed' ELSE 'pending' END, 'retry_scheduled', now() - interval '3 days');
        v_dun_count := v_dun_count + 1;
      END IF;

      -- Billing events
      INSERT INTO public.billing_events (workspace_id, subscription_id, provider, provider_event_id, event_type, payload, processed, processed_at)
      VALUES
        (v_ws_id, v_sub_id, 'mock', 'evt_' || v_inv_id || '_created', 'invoice.created',
         jsonb_build_object('invoice_id', v_inv_id, 'amount_cents',
            CASE WHEN v_ws_plan=v_plan_biz THEN 29900 WHEN v_ws_plan=v_plan_pro THEN 9900 ELSE 0 END),
         true, now() - ((v_j*30 + 2) || ' days')::interval),
        (v_ws_id, v_sub_id, 'mock', 'evt_' || v_inv_id || '_status', 'invoice.' || v_inv_status,
         jsonb_build_object('invoice_id', v_inv_id, 'status', v_inv_status), true, now() - ((v_j*30) || ' days')::interval);
      v_evt_count := v_evt_count + 2;
    END LOOP;

    -- ---------- Entitlements ----------
    INSERT INTO public.workspace_entitlements (workspace_id, feature_key, enabled, limit_value, current_usage)
    VALUES
      (v_ws_id, 'tasks',   true, (CASE WHEN v_ws_plan=v_plan_biz THEN 100000 WHEN v_ws_plan=v_plan_pro THEN 10000 ELSE 500 END),
        (CASE v_ws_scenario WHEN 'enterprise' THEN 60000 WHEN 'growing' THEN 9000 WHEN 'past_due' THEN 11000 ELSE 200 END)),
      (v_ws_id, 'members', true, (CASE WHEN v_ws_plan=v_plan_biz THEN 100 WHEN v_ws_plan=v_plan_pro THEN 25 ELSE 5 END),
        array_length(v_ws_members,1)),
      (v_ws_id, 'storage_mb', true, (CASE WHEN v_ws_plan=v_plan_biz THEN 102400 WHEN v_ws_plan=v_plan_pro THEN 10240 ELSE 500 END),
        (CASE v_ws_scenario WHEN 'enterprise' THEN 80000 WHEN 'growing' THEN 8500 WHEN 'past_due' THEN 12000 ELSE 120 END));

    -- ---------- Audit log ----------
    INSERT INTO public.audit_logs (workspace_id, actor_id, actor_email, action, entity_type, entity_id, metadata, ip_address)
    VALUES
      (v_ws_id, v_ws_owner, 'owner@homolog.flow.dev', 'workspace.created', 'workspace', v_ws_id, jsonb_build_object('seed',true), '127.0.0.1'),
      (v_ws_id, v_ws_owner, 'owner@homolog.flow.dev', 'subscription.activated', 'subscription', v_sub_id, jsonb_build_object('plan', v_ws_scenario), '127.0.0.1');

    -- ---------- Reconciliation: inject 1 inconsistency on past_due scenarios ----------
    IF v_ws_scenario = 'past_due' THEN
      INSERT INTO public.platform_reconciliation_log (workspace_id, kind, validator, severity, entity_type, entity_id, details, reason)
      VALUES (v_ws_id, 'invoice_paid_subscription_past_due', 'auto', 'warning', 'subscription', v_sub_id::text,
        jsonb_build_object('explanation','Pagamento confirmado mas assinatura ainda em past_due'),
        'Reconciliação automática');
    END IF;

  END LOOP;

  -- ---------- Backoffice: alerts, sessions, admin actions ----------
  INSERT INTO public.platform_admin_alerts (severity, kind, title, details, status)
  VALUES
    ('warning', 'past_due_spike', 'Spike de past_due detectado',
      jsonb_build_object('current_pct', 0.06, 'threshold', 0.05), 'open'),
    ('critical','mutation_failure_rate', 'Falhas elevadas em mutações administrativas',
      jsonb_build_object('per_hour', 4, 'threshold', 3), 'acknowledged'),
    ('info',    'churn_30d', 'Churn 30 dias dentro da meta',
      jsonb_build_object('current_pct', 0.04), 'resolved');

  INSERT INTO public.platform_admin_sessions (user_id, email, ip, user_agent, started_at, last_seen_at)
  VALUES
    (v_platform_id, 'platform.owner@homolog.flow.dev', '127.0.0.1', 'Mozilla/5.0 (seed)', now() - interval '2 hours', now() - interval '5 minutes'),
    (v_security_id, 'security@homolog.flow.dev',       '127.0.0.1', 'Mozilla/5.0 (seed)', now() - interval '1 day', now() - interval '23 hours');

  INSERT INTO public.platform_admin_actions_log (admin_user_id, email, event, route, ip, metadata)
  SELECT v_platform_id, 'platform.owner@homolog.flow.dev',
    (ARRAY['login','view_clients','view_finance','view_metrics','export_csv'])[1 + (g % 5)],
    '/admin', '127.0.0.1', jsonb_build_object('seed', true)
  FROM generate_series(1, 25) g;

  RETURN jsonb_build_object(
    'workspaces', v_ws_count,
    'synthetic_users', v_user_count,
    'tasks', v_task_count,
    'invoices', v_inv_count,
    'dunning_cases', v_dun_count,
    'billing_events', v_evt_count
  );
END;
$fn$;

-- Lock down: never expose to PostgREST roles
REVOKE ALL ON FUNCTION public._seed_homolog_ensure_plans() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._seed_homolog_users()        FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._seed_homolog_reset()        FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._seed_homolog_run(boolean)   FROM anon, authenticated;