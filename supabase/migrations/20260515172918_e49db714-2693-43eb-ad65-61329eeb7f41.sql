CREATE TABLE IF NOT EXISTS public.space_slack_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  slack_channel_id TEXT,
  slack_channel_name TEXT,
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_space_slack_settings_workspace_id ON public.space_slack_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_space_slack_settings_space_id ON public.space_slack_settings(space_id);

ALTER TABLE public.space_slack_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read space slack settings"
  ON public.space_slack_settings FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins insert space slack settings"
  ON public.space_slack_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update space slack settings"
  ON public.space_slack_settings FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete space slack settings"
  ON public.space_slack_settings FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_space_slack_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_space_slack_settings_updated_at
  BEFORE UPDATE ON public.space_slack_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_space_slack_settings_updated_at();