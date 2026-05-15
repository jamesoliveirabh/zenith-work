
CREATE OR REPLACE FUNCTION public.set_updated_at_slack()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.slack_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  channel_id text NOT NULL,
  channel_name text NOT NULL,
  channel_type text NOT NULL DEFAULT 'public',
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel_id)
);

CREATE INDEX idx_slack_channels_workspace ON public.slack_channels(workspace_id);
CREATE INDEX idx_slack_channels_channel ON public.slack_channels(channel_id);

ALTER TABLE public.slack_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read slack channels" ON public.slack_channels
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins insert slack channels" ON public.slack_channels
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Admins update slack channels" ON public.slack_channels
  FOR UPDATE TO authenticated USING (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Admins delete slack channels" ON public.slack_channels
  FOR DELETE TO authenticated USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_slack_channels_updated_at
  BEFORE UPDATE ON public.slack_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_slack();

ALTER TABLE public.workspace_integrations
  ADD COLUMN IF NOT EXISTS slack_default_channel_id text;
