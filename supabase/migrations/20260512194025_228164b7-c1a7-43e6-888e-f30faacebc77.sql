-- 1. Extend task_comments with threading, mentions, updated_at
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_task_comments_parent_id ON public.task_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON public.task_comments(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_task_comments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_task_comments_updated_at ON public.task_comments;
CREATE TRIGGER trg_touch_task_comments_updated_at
BEFORE UPDATE ON public.task_comments
FOR EACH ROW
EXECUTE FUNCTION public.touch_task_comments_updated_at();

-- 2. Per-task activity log table
CREATE TABLE IF NOT EXISTS public.task_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_logs_task_id ON public.task_activity_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_logs_user_id ON public.task_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_logs_created_at ON public.task_activity_logs(created_at DESC);

ALTER TABLE public.task_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read task activity logs" ON public.task_activity_logs;
CREATE POLICY "Members read task activity logs"
ON public.task_activity_logs FOR SELECT
TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "No direct inserts on task activity logs" ON public.task_activity_logs;
CREATE POLICY "No direct inserts on task activity logs"
ON public.task_activity_logs FOR INSERT
TO authenticated
WITH CHECK (false);

-- 3. Auto-log task field changes
CREATE OR REPLACE FUNCTION public.log_task_field_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    INSERT INTO public.task_activity_logs(task_id, workspace_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'changed_status',
      jsonb_build_object('status_id', OLD.status_id),
      jsonb_build_object('status_id', NEW.status_id));
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_activity_logs(task_id, workspace_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'changed_priority',
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority));
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.task_activity_logs(task_id, workspace_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'changed_due_date',
      jsonb_build_object('due_date', OLD.due_date),
      jsonb_build_object('due_date', NEW.due_date));
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.task_activity_logs(task_id, workspace_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'changed_assignee',
      jsonb_build_object('assignee_id', OLD.assignee_id),
      jsonb_build_object('assignee_id', NEW.assignee_id));
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_activity_logs(task_id, workspace_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'changed_title',
      jsonb_build_object('title', OLD.title),
      jsonb_build_object('title', NEW.title));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_field_changes ON public.tasks;
CREATE TRIGGER trg_log_task_field_changes
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_field_changes();

-- 4. Auto-log comment created
CREATE OR REPLACE FUNCTION public.log_task_comment_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_activity_logs(task_id, workspace_id, user_id, action, new_value)
  VALUES (NEW.task_id, NEW.workspace_id, NEW.author_id, 'commented',
    jsonb_build_object('comment_id', NEW.id, 'preview', LEFT(NEW.body, 140)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_comment_created ON public.task_comments;
CREATE TRIGGER trg_log_task_comment_created
AFTER INSERT ON public.task_comments
FOR EACH ROW
EXECUTE FUNCTION public.log_task_comment_created();

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity_logs;