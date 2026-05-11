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
  notif_user UUID;
BEGIN
  FOR rule IN
    SELECT * FROM public.automations
    WHERE workspace_id = NEW.workspace_id
      AND is_active
      AND (list_id IS NULL OR list_id = NEW.list_id)
  LOOP
    matched := false;

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
            notif_user := COALESCE(NULLIF(action_item->>'user_id','')::uuid, NEW.assignee_id);
            IF notif_user IS NOT NULL THEN
              INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, title, body, link_path)
              VALUES (
                NEW.workspace_id,
                notif_user,
                COALESCE(auth.uid(), rule.created_by),
                'task_assigned',
                NEW.id,
                'Automação: ' || rule.name,
                'Tarefa: ' || NEW.title,
                '/list/' || COALESCE(NEW.list_id::text, '')
              );
              applied := applied || jsonb_build_object('type','send_notification','user_id',notif_user);
            END IF;
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