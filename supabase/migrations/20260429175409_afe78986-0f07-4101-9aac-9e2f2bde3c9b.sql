-- Enum for target types
CREATE TYPE public.goal_target_type AS ENUM (
  'number',
  'percentage',
  'currency',
  'true_false',
  'task_count'
);

-- Goals table
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#7C3AED',
  owner_id UUID NOT NULL,
  start_date DATE,
  due_date DATE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_workspace ON public.goals(workspace_id) WHERE NOT is_archived;
CREATE INDEX idx_goals_owner ON public.goals(owner_id);

-- Goal targets table
CREATE TABLE public.goal_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_type public.goal_target_type NOT NULL,
  initial_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC NOT NULL DEFAULT 100,
  unit TEXT,
  list_id UUID REFERENCES public.lists(id) ON DELETE SET NULL,
  task_filter JSONB,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goal_targets_goal ON public.goal_targets(goal_id);
CREATE INDEX idx_goal_targets_list ON public.goal_targets(list_id) WHERE list_id IS NOT NULL;

-- Goal members table
CREATE TABLE public.goal_members (
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  PRIMARY KEY (goal_id, user_id)
);

-- Enable RLS
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_members ENABLE ROW LEVEL SECURITY;

-- ============== RLS: goals ==============
CREATE POLICY "Members read goals" ON public.goals FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers create goals" ON public.goals FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Owner or admins update goals" ON public.goals FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Owner or admins delete goals" ON public.goals FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR public.is_workspace_admin(workspace_id, auth.uid()));

-- ============== RLS: goal_targets ==============
CREATE POLICY "Members read goal targets" ON public.goal_targets FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Owner or admins manage targets insert" ON public.goal_targets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id
      AND (g.owner_id = auth.uid() OR public.is_workspace_admin(g.workspace_id, auth.uid())
           OR public.can_write_workspace(g.workspace_id, auth.uid())))
  );

CREATE POLICY "Owner or admins manage targets update" ON public.goal_targets FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id
      AND (g.owner_id = auth.uid() OR public.is_workspace_admin(g.workspace_id, auth.uid())
           OR public.can_write_workspace(g.workspace_id, auth.uid())))
  );

CREATE POLICY "Owner or admins manage targets delete" ON public.goal_targets FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id
      AND (g.owner_id = auth.uid() OR public.is_workspace_admin(g.workspace_id, auth.uid())))
  );

-- ============== RLS: goal_members ==============
CREATE POLICY "Members read goal members" ON public.goal_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id
      AND public.is_workspace_member(g.workspace_id, auth.uid()))
  );

CREATE POLICY "Owner or admins add goal members" ON public.goal_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id
      AND (g.owner_id = auth.uid() OR public.is_workspace_admin(g.workspace_id, auth.uid())))
  );

CREATE POLICY "Owner or admins remove goal members" ON public.goal_members FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id
      AND (g.owner_id = auth.uid() OR public.is_workspace_admin(g.workspace_id, auth.uid())))
  );

-- Updated_at trigger for goals
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== Function: calculate_goal_progress ==============
CREATE OR REPLACE FUNCTION public.calculate_goal_progress(_goal_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total NUMERIC := 0;
  cnt INTEGER := 0;
  t RECORD;
  prog NUMERIC;
  done_count INTEGER;
  total_count INTEGER;
BEGIN
  FOR t IN SELECT * FROM public.goal_targets WHERE goal_id = _goal_id LOOP
    prog := 0;
    IF t.target_type = 'task_count' AND t.list_id IS NOT NULL THEN
      SELECT COUNT(*) INTO total_count FROM public.tasks WHERE list_id = t.list_id AND parent_task_id IS NULL;
      SELECT COUNT(*) INTO done_count FROM public.tasks ts
        JOIN public.status_columns sc ON sc.id = ts.status_id
        WHERE ts.list_id = t.list_id AND ts.parent_task_id IS NULL AND sc.is_done = true;
      IF total_count > 0 THEN
        prog := (done_count::NUMERIC / total_count::NUMERIC) * 100;
      END IF;
    ELSIF t.target_type = 'true_false' THEN
      prog := CASE WHEN t.current_value >= 1 THEN 100 ELSE 0 END;
    ELSE
      IF t.target_value <> t.initial_value THEN
        prog := ((t.current_value - t.initial_value) / (t.target_value - t.initial_value)) * 100;
      END IF;
    END IF;
    prog := GREATEST(0, LEAST(100, prog));
    total := total + prog;
    cnt := cnt + 1;
  END LOOP;

  IF cnt = 0 THEN RETURN 0; END IF;
  RETURN ROUND(total / cnt, 2);
END;
$$;

-- ============== Trigger: auto-update task_count targets ==============
CREATE OR REPLACE FUNCTION public.refresh_task_count_targets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  done_count INTEGER;
  total_count INTEGER;
BEGIN
  FOR t IN SELECT * FROM public.goal_targets
    WHERE target_type = 'task_count'
      AND list_id = COALESCE(NEW.list_id, OLD.list_id)
  LOOP
    SELECT COUNT(*) INTO total_count FROM public.tasks WHERE list_id = t.list_id AND parent_task_id IS NULL;
    SELECT COUNT(*) INTO done_count FROM public.tasks ts
      JOIN public.status_columns sc ON sc.id = ts.status_id
      WHERE ts.list_id = t.list_id AND ts.parent_task_id IS NULL AND sc.is_done = true;

    UPDATE public.goal_targets
      SET current_value = done_count,
          target_value = GREATEST(total_count, 1)
      WHERE id = t.id;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tasks_refresh_goal_targets
  AFTER INSERT OR UPDATE OF status_id, list_id OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.refresh_task_count_targets();

-- ============== Trigger: log goal target updates to activity_logs ==============
-- Add new activity action values
ALTER TYPE public.activity_action ADD VALUE IF NOT EXISTS 'goal_created';
ALTER TYPE public.activity_action ADD VALUE IF NOT EXISTS 'goal_target_updated';