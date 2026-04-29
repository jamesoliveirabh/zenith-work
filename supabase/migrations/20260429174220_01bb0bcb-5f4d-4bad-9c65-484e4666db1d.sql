-- Extend enums (idempotent IF NOT EXISTS)
ALTER TYPE public.automation_trigger ADD VALUE IF NOT EXISTS 'priority_changed';
ALTER TYPE public.automation_trigger ADD VALUE IF NOT EXISTS 'due_date_approaching';
ALTER TYPE public.automation_trigger ADD VALUE IF NOT EXISTS 'comment_added';

ALTER TYPE public.automation_action_type ADD VALUE IF NOT EXISTS 'unassign_user';
ALTER TYPE public.automation_action_type ADD VALUE IF NOT EXISTS 'move_to_list';
ALTER TYPE public.automation_action_type ADD VALUE IF NOT EXISTS 'create_subtask';
ALTER TYPE public.automation_action_type ADD VALUE IF NOT EXISTS 'post_comment';
ALTER TYPE public.automation_action_type ADD VALUE IF NOT EXISTS 'send_notification';

-- Extend automations table
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS run_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

-- Replace engine with extended version
CREATE OR REPLACE FUNCTION public.run_task_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rule RECORD;
  matched BOOLEAN;
  cond_ok BOOLEAN;
  cond_item JSONB;
  action_item JSONB;
  applied JSONB := '[]'::jsonb;
  status_done BOOLEAN;
  prev_status_done BOOLEAN;
  field_val TEXT;
  new_subtask_id UUID;
BEGIN
  FOR rule IN
    SELECT * FROM public.automations
    WHERE workspace_id = NEW.workspace_id
      AND is_active
      AND (list_id IS NULL OR list_id = NEW.list_id)
  LOOP
    matched := false;

    -- Trigger matching
    IF TG_OP = 'INSERT' AND rule.trigger = 'task_created' THEN
      matched := true;
    ELSIF TG_OP = 'UPDATE' THEN
      IF rule.trigger = 'status_changed' AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        IF rule.trigger_config ? 'to_status_id'
           AND COALESCE(rule.trigger_config->>'to_status_id','') <> '' THEN
          matched := (NEW.status_id::text = rule.trigger_config->>'to_status_id');
        ELSE
          matched := true;
        END IF;
        IF matched AND rule.trigger_config ? 'from_status_id'
           AND COALESCE(rule.trigger_config->>'from_status_id','') <> '' THEN
          matched := (OLD.status_id::text = rule.trigger_config->>'from_status_id');
        END IF;
      ELSIF rule.trigger = 'priority_changed' AND NEW.priority IS DISTINCT FROM OLD.priority THEN
        matched := true;
        IF rule.trigger_config ? 'to_priority' AND COALESCE(rule.trigger_config->>'to_priority','') <> '' THEN
          matched := (NEW.priority::text = rule.trigger_config->>'to_priority');
        END IF;
        IF matched AND rule.trigger_config ? 'from_priority' AND COALESCE(rule.trigger_config->>'from_priority','') <> '' THEN
          matched := (OLD.priority::text = rule.trigger_config->>'from_priority');
        END IF;
      ELSIF rule.trigger = 'task_completed' AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        SELECT is_done INTO status_done FROM public.status_columns WHERE id = NEW.status_id;
        SELECT is_done INTO prev_status_done FROM public.status_columns WHERE id = OLD.status_id;
        matched := COALESCE(status_done, false) AND NOT COALESCE(prev_status_done, false);
      ELSIF rule.trigger = 'assignee_changed' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
        matched := true;
        IF rule.trigger_config ? 'assignee_id' AND COALESCE(rule.trigger_config->>'assignee_id','') <> '' THEN
          matched := (NEW.assignee_id::text = rule.trigger_config->>'assignee_id');
        END IF;
      END IF;
    END IF;

    IF NOT matched THEN CONTINUE; END IF;

    -- Conditions (AND). Each condition: { field, op, value }
    cond_ok := true;
    IF jsonb_typeof(rule.conditions) = 'array' THEN
      FOR cond_item IN SELECT * FROM jsonb_array_elements(rule.conditions) LOOP
        field_val := NULL;
        CASE cond_item->>'field'
          WHEN 'priority' THEN field_val := NEW.priority::text;
          WHEN 'status' THEN field_val := NEW.status_id::text;
          WHEN 'assignee' THEN field_val := NEW.assignee_id::text;
          WHEN 'list' THEN field_val := NEW.list_id::text;
          WHEN 'tag' THEN
            IF cond_item->>'op' IN ('contains','not_contains') THEN
              IF (cond_item->>'op' = 'contains') THEN
                cond_ok := cond_ok AND ((cond_item->>'value') = ANY(COALESCE(NEW.tags,'{}'::text[])));
              ELSE
                cond_ok := cond_ok AND NOT ((cond_item->>'value') = ANY(COALESCE(NEW.tags,'{}'::text[])));
              END IF;
              CONTINUE;
            END IF;
          ELSE NULL;
        END CASE;
        IF (cond_item->>'op') = 'eq' THEN
          cond_ok := cond_ok AND (COALESCE(field_val,'') = COALESCE(cond_item->>'value',''));
        ELSIF (cond_item->>'op') = 'neq' THEN
          cond_ok := cond_ok AND (COALESCE(field_val,'') <> COALESCE(cond_item->>'value',''));
        END IF;
        IF NOT cond_ok THEN EXIT; END IF;
      END LOOP;
    END IF;

    IF NOT cond_ok THEN
      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, applied_actions)
      VALUES (rule.id, rule.workspace_id, NEW.id, 'skipped', '[]'::jsonb);
      CONTINUE;
    END IF;

    applied := '[]'::jsonb;

    BEGIN
      FOR action_item IN SELECT * FROM jsonb_array_elements(rule.actions) LOOP
        CASE action_item->>'type'
          WHEN 'set_status' THEN
            IF COALESCE(action_item->>'status_id','') <> '' THEN
              NEW.status_id := (action_item->>'status_id')::uuid;
              applied := applied || jsonb_build_object('type','set_status','value',action_item->>'status_id');
            END IF;
          WHEN 'set_assignee', 'assign_user' THEN
            NEW.assignee_id := NULLIF(action_item->>'assignee_id','')::uuid;
            applied := applied || jsonb_build_object('type','set_assignee','value',action_item->>'assignee_id');
          WHEN 'unassign_user' THEN
            NEW.assignee_id := NULL;
            applied := applied || jsonb_build_object('type','unassign_user');
          WHEN 'set_priority' THEN
            IF action_item->>'priority' IN ('low','medium','high','urgent') THEN
              NEW.priority := (action_item->>'priority')::public.task_priority;
              applied := applied || jsonb_build_object('type','set_priority','value',action_item->>'priority');
            END IF;
          WHEN 'add_tag' THEN
            IF COALESCE(action_item->>'tag','') <> '' THEN
              NEW.tags := COALESCE(NEW.tags,'{}'::text[])
                || (CASE WHEN (action_item->>'tag') = ANY(COALESCE(NEW.tags,'{}'::text[]))
                         THEN '{}'::text[]
                         ELSE ARRAY[action_item->>'tag'] END);
              applied := applied || jsonb_build_object('type','add_tag','value',action_item->>'tag');
            END IF;
          WHEN 'set_due_date' THEN
            IF action_item->>'days_from_now' IS NOT NULL THEN
              NEW.due_date := now() + ((action_item->>'days_from_now')::int || ' days')::interval;
              applied := applied || jsonb_build_object('type','set_due_date','days',action_item->>'days_from_now');
            END IF;
          WHEN 'move_to_list' THEN
            IF COALESCE(action_item->>'list_id','') <> '' THEN
              NEW.list_id := (action_item->>'list_id')::uuid;
              applied := applied || jsonb_build_object('type','move_to_list','value',action_item->>'list_id');
            END IF;
          WHEN 'post_comment' THEN
            IF COALESCE(action_item->>'body','') <> '' THEN
              INSERT INTO public.task_comments(workspace_id, task_id, author_id, body)
              VALUES (NEW.workspace_id, NEW.id, COALESCE(auth.uid(), rule.created_by), action_item->>'body');
              applied := applied || jsonb_build_object('type','post_comment');
            END IF;
          WHEN 'create_subtask' THEN
            IF COALESCE(action_item->>'title','') <> '' THEN
              INSERT INTO public.tasks(workspace_id, list_id, parent_task_id, title, created_by)
              VALUES (NEW.workspace_id, NEW.list_id, NEW.id, action_item->>'title', COALESCE(auth.uid(), rule.created_by))
              RETURNING id INTO new_subtask_id;
              applied := applied || jsonb_build_object('type','create_subtask','id',new_subtask_id);
            END IF;
          WHEN 'send_notification' THEN
            INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, title, body, link_path)
            VALUES (
              NEW.workspace_id,
              COALESCE(NULLIF(action_item->>'user_id','')::uuid, NEW.assignee_id, rule.created_by),
              COALESCE(auth.uid(), rule.created_by),
              'task_assigned',
              NEW.id,
              COALESCE(action_item->>'title', 'Notificação de automação'),
              action_item->>'body',
              public.task_link_path(NEW.id)
            );
            applied := applied || jsonb_build_object('type','send_notification');
          ELSE NULL;
        END CASE;
      END LOOP;

      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, applied_actions)
      VALUES (rule.id, rule.workspace_id, NEW.id, 'success', applied);

      UPDATE public.automations
        SET run_count = run_count + 1, last_run_at = now()
        WHERE id = rule.id;

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, error_message, applied_actions)
      VALUES (rule.id, rule.workspace_id, NEW.id, 'failed', SQLERRM, applied);
    END;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on tasks (INSERT and UPDATE; BEFORE so NEW changes persist)
DROP TRIGGER IF EXISTS run_task_automations_trg ON public.tasks;
CREATE TRIGGER run_task_automations_trg
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.run_task_automations();

-- Comment-added trigger: emits an automation pass via a separate function
CREATE OR REPLACE FUNCTION public.run_comment_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rule RECORD;
  applied JSONB := '[]'::jsonb;
  action_item JSONB;
  task_rec RECORD;
BEGIN
  SELECT * INTO task_rec FROM public.tasks WHERE id = NEW.task_id;
  IF task_rec.id IS NULL THEN RETURN NEW; END IF;

  FOR rule IN
    SELECT * FROM public.automations
    WHERE workspace_id = NEW.workspace_id
      AND is_active
      AND trigger = 'comment_added'
      AND (list_id IS NULL OR list_id = task_rec.list_id)
  LOOP
    applied := '[]'::jsonb;
    BEGIN
      FOR action_item IN SELECT * FROM jsonb_array_elements(rule.actions) LOOP
        IF action_item->>'type' = 'send_notification' THEN
          INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, title, body, link_path)
          VALUES (
            NEW.workspace_id,
            COALESCE(NULLIF(action_item->>'user_id','')::uuid, task_rec.assignee_id, rule.created_by),
            NEW.author_id,
            'task_commented',
            task_rec.id,
            COALESCE(action_item->>'title', 'Novo comentário'),
            action_item->>'body',
            public.task_link_path(task_rec.id)
          );
          applied := applied || jsonb_build_object('type','send_notification');
        END IF;
      END LOOP;

      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, applied_actions)
      VALUES (rule.id, rule.workspace_id, task_rec.id, 'success', applied);

      UPDATE public.automations SET run_count = run_count + 1, last_run_at = now() WHERE id = rule.id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, error_message, applied_actions)
      VALUES (rule.id, rule.workspace_id, task_rec.id, 'failed', SQLERRM, applied);
    END;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS run_comment_automations_trg ON public.task_comments;
CREATE TRIGGER run_comment_automations_trg
AFTER INSERT ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.run_comment_automations();