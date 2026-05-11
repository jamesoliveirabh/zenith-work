
CREATE OR REPLACE FUNCTION public.check_circular_dependency(
  source_id UUID,
  target_id UUID,
  workspace_id UUID DEFAULT NULL,
  dep_type VARCHAR DEFAULT 'blocks'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src_ws UUID;
  tgt_ws UUID;
BEGIN
  IF source_id IS NULL OR target_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'missing_task');
  END IF;

  IF source_id = target_id THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'self_reference',
      'message', 'Uma tarefa não pode depender de si mesma'
    );
  END IF;

  -- Both tasks must exist and live in the same workspace.
  SELECT workspace_id INTO src_ws FROM public.tasks WHERE id = source_id;
  SELECT workspace_id INTO tgt_ws FROM public.tasks WHERE id = target_id;
  IF src_ws IS NULL OR tgt_ws IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'task_not_found');
  END IF;
  IF src_ws <> tgt_ws THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'workspace_mismatch',
      'message', 'As tarefas pertencem a workspaces diferentes'
    );
  END IF;
  IF workspace_id IS NOT NULL AND workspace_id <> src_ws THEN
    RETURN jsonb_build_object('valid', false, 'error', 'workspace_mismatch');
  END IF;

  -- Reuse the existing graph-walk function for cycle detection.
  IF public.task_dependency_would_cycle(source_id, target_id, COALESCE(dep_type, 'blocks')) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'circular',
      'message', 'Esta dependência criaria um ciclo'
    );
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_circular_dependency(UUID, UUID, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_circular_dependency(UUID, UUID, UUID, VARCHAR) TO authenticated;
