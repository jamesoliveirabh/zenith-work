
-- Task dependencies table
CREATE TABLE public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  target_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(20) NOT NULL CHECK (dependency_type IN ('blocks','blocked_by','related_to')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT task_dependencies_no_self CHECK (source_task_id <> target_task_id),
  CONSTRAINT task_dependencies_unique UNIQUE (source_task_id, target_task_id, dependency_type)
);

CREATE INDEX idx_task_dependencies_source ON public.task_dependencies(source_task_id);
CREATE INDEX idx_task_dependencies_target ON public.task_dependencies(target_task_id);
CREATE INDEX idx_task_dependencies_workspace ON public.task_dependencies(workspace_id);

-- Function: detect circular dependency for blocks/blocked_by chains.
-- Normalizes 'blocked_by' as inverted 'blocks' edge: source blocks target meaning source must finish before target.
-- For 'blocked_by': target blocks source.
CREATE OR REPLACE FUNCTION public.task_dependency_would_cycle(
  _source UUID,
  _target UUID,
  _type VARCHAR
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_from UUID;
  edge_to UUID;
  found BOOLEAN;
BEGIN
  IF _type = 'related_to' THEN
    RETURN FALSE;
  END IF;

  IF _type = 'blocks' THEN
    edge_from := _source;
    edge_to := _target;
  ELSIF _type = 'blocked_by' THEN
    edge_from := _target;
    edge_to := _source;
  ELSE
    RETURN FALSE;
  END IF;

  -- Walk existing blocking edges from edge_to and see if we reach edge_from.
  WITH RECURSIVE edges AS (
    SELECT source_task_id AS from_task, target_task_id AS to_task
      FROM public.task_dependencies WHERE dependency_type = 'blocks'
    UNION ALL
    SELECT target_task_id AS from_task, source_task_id AS to_task
      FROM public.task_dependencies WHERE dependency_type = 'blocked_by'
  ),
  walk AS (
    SELECT to_task AS node FROM edges WHERE from_task = edge_to
    UNION
    SELECT e.to_task FROM edges e JOIN walk w ON e.from_task = w.node
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE node = edge_from) INTO found;

  RETURN COALESCE(found, FALSE);
END;
$$;

-- Trigger to enforce no circular blocking dependencies
CREATE OR REPLACE FUNCTION public.task_dependencies_prevent_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.task_dependency_would_cycle(NEW.source_task_id, NEW.target_task_id, NEW.dependency_type) THEN
    RAISE EXCEPTION 'Circular task dependency detected'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_dependencies_prevent_cycle
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.task_dependencies_prevent_cycle();

-- RLS
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view task dependencies"
  ON public.task_dependencies FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers can create task dependencies"
  ON public.task_dependencies FOR INSERT
  WITH CHECK (
    public.can_write_workspace(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Creators or admins can delete task dependencies"
  ON public.task_dependencies FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );
