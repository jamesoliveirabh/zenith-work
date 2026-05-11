
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS progress_percentage INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_subtasks INT NOT NULL DEFAULT 0;

CREATE TABLE public.task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  parent_subtask_id UUID REFERENCES public.task_subtasks(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT subtask_no_self_parent CHECK (parent_subtask_id IS NULL OR parent_subtask_id <> id)
);

CREATE INDEX idx_subtasks_task ON public.task_subtasks(task_id);
CREATE INDEX idx_subtasks_parent ON public.task_subtasks(parent_subtask_id);
CREATE INDEX idx_subtasks_workspace ON public.task_subtasks(task_id, order_index);

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read subtasks"
ON public.task_subtasks FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_subtasks.task_id
    AND public.is_workspace_member(t.workspace_id, auth.uid())
));

CREATE POLICY "Writers insert subtasks"
ON public.task_subtasks FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_subtasks.task_id
    AND public.can_write_workspace(t.workspace_id, auth.uid())
));

CREATE POLICY "Writers update subtasks"
ON public.task_subtasks FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_subtasks.task_id
    AND public.can_write_workspace(t.workspace_id, auth.uid())
));

CREATE POLICY "Writers delete subtasks"
ON public.task_subtasks FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_subtasks.task_id
    AND public.can_write_workspace(t.workspace_id, auth.uid())
));

CREATE OR REPLACE FUNCTION public.enforce_subtask_max_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  depth INT := 1;
  current_parent UUID := NEW.parent_subtask_id;
BEGIN
  WHILE current_parent IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 3 THEN
      RAISE EXCEPTION 'Subtask nesting cannot exceed 3 levels';
    END IF;
    SELECT parent_subtask_id INTO current_parent
      FROM public.task_subtasks WHERE id = current_parent;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subtask_max_depth
BEFORE INSERT OR UPDATE OF parent_subtask_id ON public.task_subtasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_subtask_max_depth();

CREATE TRIGGER trg_subtask_updated_at
BEFORE UPDATE ON public.task_subtasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_subtask_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_completed AND (TG_OP = 'INSERT' OR OLD.is_completed IS DISTINCT FROM NEW.is_completed) THEN
    NEW.completed_at := now();
  ELSIF NOT NEW.is_completed AND TG_OP = 'UPDATE' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subtask_set_completed_at
BEFORE INSERT OR UPDATE OF is_completed ON public.task_subtasks
FOR EACH ROW EXECUTE FUNCTION public.set_subtask_completed_at();

CREATE OR REPLACE FUNCTION public.recalc_task_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_task UUID;
  total INT;
  done INT;
  pct INT;
BEGIN
  affected_task := COALESCE(NEW.task_id, OLD.task_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed)
    INTO total, done
  FROM public.task_subtasks
  WHERE task_id = affected_task;

  IF total = 0 THEN
    pct := 0;
  ELSE
    pct := ROUND((done::numeric / total::numeric) * 100);
  END IF;

  UPDATE public.tasks
     SET total_subtasks = total,
         progress_percentage = pct,
         updated_at = now()
   WHERE id = affected_task;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalc_task_progress
AFTER INSERT OR UPDATE OF is_completed OR DELETE ON public.task_subtasks
FOR EACH ROW EXECUTE FUNCTION public.recalc_task_progress();
