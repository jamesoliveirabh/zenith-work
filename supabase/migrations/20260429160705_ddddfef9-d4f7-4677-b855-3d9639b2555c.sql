CREATE TABLE public.task_assignees (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);
CREATE INDEX idx_task_assignees_workspace ON public.task_assignees(workspace_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read task assignees"
ON public.task_assignees
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers insert task assignees"
ON public.task_assignees
FOR INSERT
TO authenticated
WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "Writers delete task assignees"
ON public.task_assignees
FOR DELETE
TO authenticated
USING (public.can_write_workspace(workspace_id, auth.uid()));

-- Backfill: copy existing single assignee_id into task_assignees
INSERT INTO public.task_assignees (task_id, user_id, workspace_id)
SELECT id, assignee_id, workspace_id
FROM public.tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;