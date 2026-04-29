-- Time tracking: time_entries table + time_estimate_seconds on tasks

CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_task ON public.time_entries(task_id);
CREATE INDEX idx_time_entries_user_active ON public.time_entries(user_id) WHERE ended_at IS NULL;
CREATE INDEX idx_time_entries_workspace ON public.time_entries(workspace_id);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read time entries"
ON public.time_entries FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Owners create own time entries"
ON public.time_entries FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_workspace_member(workspace_id, auth.uid())
);

CREATE POLICY "Owners update own time entries"
ON public.time_entries FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners or admins delete time entries"
ON public.time_entries FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_workspace_admin(workspace_id, auth.uid())
);

ALTER TABLE public.tasks ADD COLUMN time_estimate_seconds INT;