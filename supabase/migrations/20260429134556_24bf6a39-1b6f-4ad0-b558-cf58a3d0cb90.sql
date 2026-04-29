CREATE TABLE public.list_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  list_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_list_views_list ON public.list_views(list_id);
CREATE INDEX idx_list_views_owner ON public.list_views(owner_id);

ALTER TABLE public.list_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read views"
  ON public.list_views FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id, auth.uid())
    AND (is_shared OR owner_id = auth.uid())
  );

CREATE POLICY "Writers create own views"
  ON public.list_views FOR INSERT TO authenticated
  WITH CHECK (
    can_write_workspace(workspace_id, auth.uid())
    AND owner_id = auth.uid()
    AND (NOT is_shared OR is_workspace_admin(workspace_id, auth.uid()))
  );

CREATE POLICY "Owners or admins update views"
  ON public.list_views FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Owners or admins delete views"
  ON public.list_views FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_list_views_updated_at
  BEFORE UPDATE ON public.list_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();