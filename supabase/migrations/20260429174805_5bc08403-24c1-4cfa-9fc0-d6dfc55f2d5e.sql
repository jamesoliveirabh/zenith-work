-- Index for Gantt date range queries
CREATE INDEX IF NOT EXISTS idx_tasks_dates
  ON public.tasks(list_id, start_date, due_date)
  WHERE start_date IS NOT NULL OR due_date IS NOT NULL;

-- Task relations enum
DO $$ BEGIN
  CREATE TYPE public.task_relation_type AS ENUM ('blocks', 'relates_to', 'duplicates');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.task_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  target_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  relation_type public.task_relation_type NOT NULL DEFAULT 'blocks',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_relations_no_self CHECK (source_task_id <> target_task_id),
  CONSTRAINT task_relations_unique UNIQUE (source_task_id, target_task_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_task_relations_source ON public.task_relations(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_target ON public.task_relations(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_workspace ON public.task_relations(workspace_id);

ALTER TABLE public.task_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read task relations"
  ON public.task_relations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers create task relations"
  ON public.task_relations FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_workspace(workspace_id, auth.uid())
    AND auth.uid() = created_by
  );

CREATE POLICY "Creators or admins delete task relations"
  ON public.task_relations FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );