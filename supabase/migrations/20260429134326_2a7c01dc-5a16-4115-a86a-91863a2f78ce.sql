-- Notifications table
CREATE TYPE public.notification_type AS ENUM (
  'task_assigned',
  'task_mentioned',
  'task_commented',
  'task_status_changed',
  'task_completed',
  'invitation_accepted'
);

CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  actor_id UUID,
  type public.notification_type NOT NULL,
  task_id UUID,
  comment_id UUID,
  title TEXT NOT NULL,
  body TEXT,
  link_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_workspace ON public.notifications(workspace_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Helper: build link path for a task
CREATE OR REPLACE FUNCTION public.task_link_path(_task_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT '/list/' || list_id::text FROM public.tasks WHERE id = _task_id;
$$;

-- Trigger: notify on task assignment changes (insert + update)
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  task_title TEXT := COALESCE(NEW.title, 'Tarefa');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, title, body, link_path)
      VALUES (NEW.workspace_id, NEW.assignee_id, actor, 'task_assigned', NEW.id,
              'Você foi atribuído a uma tarefa', task_title, public.task_link_path(NEW.id));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       AND NEW.assignee_id IS NOT NULL
       AND NEW.assignee_id <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, title, body, link_path)
      VALUES (NEW.workspace_id, NEW.assignee_id, actor, 'task_assigned', NEW.id,
              'Você foi atribuído a uma tarefa', task_title, public.task_link_path(NEW.id));
    END IF;

    IF NEW.status_id IS DISTINCT FROM OLD.status_id AND NEW.assignee_id IS NOT NULL
       AND NEW.assignee_id <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, title, body, link_path)
      SELECT NEW.workspace_id, NEW.assignee_id, actor,
             CASE WHEN sc.is_done THEN 'task_completed'::public.notification_type
                  ELSE 'task_status_changed'::public.notification_type END,
             NEW.id,
             CASE WHEN sc.is_done THEN 'Tarefa concluída'
                  ELSE 'Status atualizado: ' || sc.name END,
             task_title, public.task_link_path(NEW.id)
      FROM public.status_columns sc WHERE sc.id = NEW.status_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_assign_ins
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();

CREATE TRIGGER trg_notify_task_assign_upd
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();

-- Trigger: notify watchers/assignee on new comment
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  task_rec RECORD;
  recipient UUID;
BEGIN
  SELECT id, title, assignee_id, created_by, list_id FROM public.tasks WHERE id = NEW.task_id INTO task_rec;
  IF task_rec.id IS NULL THEN RETURN NEW; END IF;

  -- Notify assignee, creator, and watchers (excluding the comment author)
  FOR recipient IN
    SELECT DISTINCT uid FROM (
      SELECT task_rec.assignee_id AS uid
      UNION SELECT task_rec.created_by
      UNION SELECT user_id FROM public.task_watchers WHERE task_id = NEW.task_id
    ) s
    WHERE uid IS NOT NULL AND uid <> NEW.author_id
  LOOP
    INSERT INTO public.notifications(workspace_id, user_id, actor_id, type, task_id, comment_id, title, body, link_path)
    VALUES (NEW.workspace_id, recipient, NEW.author_id, 'task_commented', NEW.task_id, NEW.id,
            'Novo comentário em "' || COALESCE(task_rec.title,'tarefa') || '"',
            left(NEW.body, 200), '/list/' || task_rec.list_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_comment
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment();

-- Mark all read RPC
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.notifications SET is_read = true
  WHERE user_id = auth.uid() AND workspace_id = _workspace_id AND is_read = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;