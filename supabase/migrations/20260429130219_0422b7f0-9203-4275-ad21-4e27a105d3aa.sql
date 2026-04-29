-- Custom field types
CREATE TYPE public.custom_field_type AS ENUM ('text', 'number', 'select', 'checkbox', 'date', 'url');

-- Custom fields definition (per workspace, optionally scoped to a list)
CREATE TABLE public.custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  list_id UUID, -- null = applies to all lists in workspace
  name TEXT NOT NULL,
  type public.custom_field_type NOT NULL DEFAULT 'text',
  options JSONB NOT NULL DEFAULT '[]'::jsonb, -- for select: [{label, color}]
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_fields_ws ON public.custom_fields(workspace_id);
CREATE INDEX idx_custom_fields_list ON public.custom_fields(list_id);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read custom fields" ON public.custom_fields
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins create custom fields" ON public.custom_fields
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Admins update custom fields" ON public.custom_fields
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Admins delete custom fields" ON public.custom_fields
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_custom_fields_updated_at
BEFORE UPDATE ON public.custom_fields
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Task field values
CREATE TABLE public.task_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL,
  field_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, field_id)
);

CREATE INDEX idx_field_values_task ON public.task_field_values(task_id);
CREATE INDEX idx_field_values_field ON public.task_field_values(field_id);

ALTER TABLE public.task_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read field values" ON public.task_field_values
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Writers insert field values" ON public.task_field_values
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers update field values" ON public.task_field_values
  FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers delete field values" ON public.task_field_values
  FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER trg_field_values_updated_at
BEFORE UPDATE ON public.task_field_values
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- GIN index on tags for fast filtering
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON public.tasks USING GIN(tags);