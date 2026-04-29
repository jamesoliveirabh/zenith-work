-- Activity action enum
CREATE TYPE public.activity_action AS ENUM (
  'task_created', 'task_updated', 'task_deleted', 'task_completed',
  'task_assigned', 'comment_created', 'attachment_added',
  'list_created', 'space_created', 'member_joined'
);

-- Activity logs table
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action public.activity_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_title TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_workspace ON public.activity_logs(workspace_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read activity"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Inserts only via SECURITY DEFINER triggers below (no direct insert policy needed,
-- but we add an explicit deny-by-default INSERT policy for clarity).
CREATE POLICY "No direct inserts on activity_logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (false);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- ===== Trigger functions =====

-- Tasks: insert/update/delete -> activity
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  was_done BOOLEAN;
  is_done BOOLEAN;
BEGIN
  IF actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title)
    VALUES (NEW.workspace_id, actor, 'task_created', 'task', NEW.id, NEW.title);

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status change -> possibly completion
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      SELECT is_done INTO was_done FROM public.status_columns WHERE id = OLD.status_id;
      SELECT is_done INTO is_done FROM public.status_columns WHERE id = NEW.status_id;

      IF COALESCE(is_done, false) AND NOT COALESCE(was_done, false) THEN
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
$$;

CREATE TRIGGER trg_log_task_activity
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- Comments
CREATE OR REPLACE FUNCTION public.log_comment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  task_title TEXT;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
  VALUES (NEW.workspace_id, actor, 'comment_created', 'comment', NEW.id, task_title,
          jsonb_build_object('task_id', NEW.task_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_comment_activity
AFTER INSERT ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.log_comment_activity();

-- Attachments
CREATE OR REPLACE FUNCTION public.log_attachment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  task_title TEXT;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
  VALUES (NEW.workspace_id, actor, 'attachment_added', 'task', NEW.task_id, task_title,
          jsonb_build_object('attachment_id', NEW.id, 'filename', NEW.filename));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_attachment_activity
AFTER INSERT ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.log_attachment_activity();

-- Lists
CREATE OR REPLACE FUNCTION public.log_list_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title)
  VALUES (NEW.workspace_id, actor, 'list_created', 'list', NEW.id, NEW.name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_list_activity
AFTER INSERT ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.log_list_activity();

-- Spaces
CREATE OR REPLACE FUNCTION public.log_space_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title)
  VALUES (NEW.workspace_id, actor, 'space_created', 'space', NEW.id, NEW.name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_space_activity
AFTER INSERT ON public.spaces
FOR EACH ROW EXECUTE FUNCTION public.log_space_activity();

-- Workspace members joined
CREATE OR REPLACE FUNCTION public.log_member_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := COALESCE(auth.uid(), NEW.user_id);
  uname TEXT;
BEGIN
  SELECT COALESCE(display_name, email) INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.activity_logs(workspace_id, actor_id, action, entity_type, entity_id, entity_title, metadata)
  VALUES (NEW.workspace_id, actor, 'member_joined', 'member', NEW.user_id, uname,
          jsonb_build_object('role', NEW.role));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_member_activity
AFTER INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.log_member_activity();

-- ===== Dashboard widget configs =====
CREATE TABLE public.dashboard_widget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, widget_type)
);

CREATE INDEX idx_dashboard_widget_user_ws
  ON public.dashboard_widget_configs(user_id, workspace_id);

ALTER TABLE public.dashboard_widget_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own widget configs"
  ON public.dashboard_widget_configs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own widget configs"
  ON public.dashboard_widget_configs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Users update own widget configs"
  ON public.dashboard_widget_configs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own widget configs"
  ON public.dashboard_widget_configs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_dashboard_widget_updated_at
BEFORE UPDATE ON public.dashboard_widget_configs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();