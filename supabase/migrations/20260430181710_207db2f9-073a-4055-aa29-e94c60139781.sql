CREATE OR REPLACE FUNCTION public.log_task_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor UUID := auth.uid();
  v_was_done BOOLEAN;
  v_is_done BOOLEAN;
BEGIN
  IF actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title)
    VALUES (NEW.workspace_id, actor, 'task_created', 'task', NEW.id, NEW.title);

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      SELECT sc.is_done INTO v_was_done FROM public.status_columns sc WHERE sc.id = OLD.status_id;
      SELECT sc.is_done INTO v_is_done FROM public.status_columns sc WHERE sc.id = NEW.status_id;

      IF COALESCE(v_is_done, false) AND NOT COALESCE(v_was_done, false) THEN
        INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
        VALUES (NEW.workspace_id, actor, 'task_completed', 'task', NEW.id, NEW.title,
                jsonb_build_object('from_status', OLD.status_id, 'to_status', NEW.status_id));
      ELSE
        INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
        VALUES (NEW.workspace_id, actor, 'task_updated', 'task', NEW.id, NEW.title,
                jsonb_build_object('field', 'status_id', 'from', OLD.status_id, 'to', NEW.status_id));
      END IF;
    END IF;

    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
      INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
      VALUES (NEW.workspace_id, actor, 'task_assigned', 'task', NEW.id, NEW.title,
              jsonb_build_object('assignee_id', NEW.assignee_id));
    END IF;

    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
      VALUES (NEW.workspace_id, actor, 'task_updated', 'task', NEW.id, NEW.title,
              jsonb_build_object('field', 'title', 'from', OLD.title, 'to', NEW.title));
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
      VALUES (NEW.workspace_id, actor, 'task_updated', 'task', NEW.id, NEW.title,
              jsonb_build_object('field', 'priority', 'from', OLD.priority, 'to', NEW.priority));
    END IF;

    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
      VALUES (NEW.workspace_id, actor, 'task_updated', 'task', NEW.id, NEW.title,
              jsonb_build_object('field', 'due_date', 'from', OLD.due_date, 'to', NEW.due_date));
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title)
    VALUES (OLD.workspace_id, actor, 'task_deleted', 'task', OLD.id, OLD.title);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;