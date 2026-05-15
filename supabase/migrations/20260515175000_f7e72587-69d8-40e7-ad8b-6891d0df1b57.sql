DROP TABLE IF EXISTS public.space_slack_settings CASCADE;

CREATE TABLE IF NOT EXISTS public.team_slack_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  slack_channel_id TEXT,
  slack_channel_name TEXT,
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_slack_settings_workspace_id ON public.team_slack_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_slack_settings_team_id ON public.team_slack_settings(team_id);

DROP TRIGGER IF EXISTS update_team_slack_settings_updated_at ON public.team_slack_settings;
CREATE TRIGGER update_team_slack_settings_updated_at
BEFORE UPDATE ON public.team_slack_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.team_slack_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read team slack settings"
  ON public.team_slack_settings FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins insert team slack settings"
  ON public.team_slack_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update team slack settings"
  ON public.team_slack_settings FOR UPDATE
  TO authenticated
  USING (is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete team slack settings"
  ON public.team_slack_settings FOR DELETE
  TO authenticated
  USING (is_workspace_admin(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.run_task_automations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation RECORD;
  v_action JSONB;
  v_message TEXT;
  v_channel_id TEXT;
  v_team_id UUID;
  v_space_id UUID;
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  SELECT l.space_id INTO v_space_id FROM public.lists l WHERE l.id = NEW.list_id;
  IF v_space_id IS NOT NULL THEN
    SELECT sm.team_id INTO v_team_id
      FROM public.space_memberships sm
      WHERE sm.space_id = v_space_id
      LIMIT 1;
  END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  FOR v_automation IN
    SELECT * FROM public.automations
    WHERE workspace_id = NEW.workspace_id
      AND is_active = true
      AND (list_id IS NULL OR list_id = NEW.list_id)
  LOOP
    FOR v_action IN SELECT * FROM jsonb_array_elements(v_automation.actions)
    LOOP
      IF v_action->>'type' = 'slack_notify' THEN
        v_message := COALESCE(v_action->>'message', 'Tarefa: ' || NEW.title);
        v_channel_id := v_action->>'channel_id';

        PERFORM net.http_post(
          url := v_url || '/functions/v1/send-slack-message',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_service_key),
          body := jsonb_build_object(
            'workspace_id', NEW.workspace_id,
            'channel_id', v_channel_id,
            'team_id', v_team_id,
            'message', v_message
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;