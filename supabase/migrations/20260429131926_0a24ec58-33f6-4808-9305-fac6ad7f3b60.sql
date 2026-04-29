-- Enums for automation triggers and actions
CREATE TYPE public.automation_trigger AS ENUM (
  'task_created',
  'status_changed',
  'task_completed',
  'assignee_changed'
);

CREATE TYPE public.automation_action_type AS ENUM (
  'set_status',
  'set_assignee',
  'set_priority',
  'add_tag',
  'set_due_date'
);

-- Automations table
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  list_id UUID, -- optional scope to a single list
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger public.automation_trigger NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. { "to_status_id": "..." }
  actions JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of { type, ...params }
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_workspace ON public.automations(workspace_id) WHERE is_active;
CREATE INDEX idx_automations_list ON public.automations(list_id) WHERE list_id IS NOT NULL;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automations" ON public.automations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins create automations" ON public.automations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update automations" ON public.automations
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete automations" ON public.automations
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automation runs (execution log)
CREATE TABLE public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  task_id UUID,
  status TEXT NOT NULL, -- 'success' | 'error'
  error_message TEXT,
  applied_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_automation ON public.automation_runs(automation_id, created_at DESC);
CREATE INDEX idx_automation_runs_workspace ON public.automation_runs(workspace_id, created_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automation runs" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- No insert/update/delete policies — only the SECURITY DEFINER trigger writes here.

-- Execution function: runs after task insert/update
CREATE OR REPLACE FUNCTION public.run_task_automations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule RECORD;
  matched BOOLEAN;
  action_item JSONB;
  applied JSONB := '[]'::jsonb;
  trig public.automation_trigger;
  status_done BOOLEAN;
  prev_status_done BOOLEAN;
BEGIN
  -- Determine which trigger applies
  IF TG_OP = 'INSERT' THEN
    trig := 'task_created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Pick the most specific trigger; we'll loop and re-check per rule below.
    trig := NULL;
  END IF;

  FOR rule IN
    SELECT * FROM public.automations
    WHERE workspace_id = NEW.workspace_id
      AND is_active
      AND (list_id IS NULL OR list_id = NEW.list_id)
  LOOP
    matched := false;

    IF TG_OP = 'INSERT' AND rule.trigger = 'task_created' THEN
      matched := true;

    ELSIF TG_OP = 'UPDATE' THEN
      IF rule.trigger = 'status_changed'
         AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        -- Optional filter: trigger_config.to_status_id
        IF rule.trigger_config ? 'to_status_id'
           AND rule.trigger_config->>'to_status_id' IS NOT NULL
           AND rule.trigger_config->>'to_status_id' <> '' THEN
          matched := (NEW.status_id::text = rule.trigger_config->>'to_status_id');
        ELSE
          matched := true;
        END IF;

      ELSIF rule.trigger = 'task_completed'
            AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        SELECT is_done INTO status_done FROM public.status_columns WHERE id = NEW.status_id;
        SELECT is_done INTO prev_status_done FROM public.status_columns WHERE id = OLD.status_id;
        matched := COALESCE(status_done, false) AND NOT COALESCE(prev_status_done, false);

      ELSIF rule.trigger = 'assignee_changed'
            AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
        matched := true;
      END IF;
    END IF;

    IF NOT matched THEN
      CONTINUE;
    END IF;

    applied := '[]'::jsonb;

    BEGIN
      FOR action_item IN SELECT * FROM jsonb_array_elements(rule.actions)
      LOOP
        CASE action_item->>'type'
          WHEN 'set_status' THEN
            IF action_item->>'status_id' IS NOT NULL THEN
              NEW.status_id := (action_item->>'status_id')::uuid;
              applied := applied || jsonb_build_object('type','set_status','value',action_item->>'status_id');
            END IF;
          WHEN 'set_assignee' THEN
            NEW.assignee_id := NULLIF(action_item->>'assignee_id','')::uuid;
            applied := applied || jsonb_build_object('type','set_assignee','value',action_item->>'assignee_id');
          WHEN 'set_priority' THEN
            IF action_item->>'priority' IN ('low','medium','high','urgent') THEN
              NEW.priority := (action_item->>'priority')::public.task_priority;
              applied := applied || jsonb_build_object('type','set_priority','value',action_item->>'priority');
            END IF;
          WHEN 'add_tag' THEN
            IF action_item->>'tag' IS NOT NULL AND action_item->>'tag' <> '' THEN
              NEW.tags := COALESCE(NEW.tags,'{}'::text[])
                || (CASE WHEN (action_item->>'tag') = ANY(COALESCE(NEW.tags,'{}'::text[]))
                         THEN '{}'::text[]
                         ELSE ARRAY[action_item->>'tag'] END);
              applied := applied || jsonb_build_object('type','add_tag','value',action_item->>'tag');
            END IF;
          WHEN 'set_due_date' THEN
            IF action_item->>'days_from_now' IS NOT NULL THEN
              NEW.due_date := now() + ((action_item->>'days_from_now')::int || ' days')::interval;
              applied := applied || jsonb_build_object('type','set_due_date','days',action_item->>'days_from_now');
            END IF;
          ELSE
            -- unknown action type, skip
            NULL;
        END CASE;
      END LOOP;

      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, applied_actions)
      VALUES (rule.id, rule.workspace_id, NEW.id, 'success', applied);

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.automation_runs (automation_id, workspace_id, task_id, status, error_message, applied_actions)
      VALUES (rule.id, rule.workspace_id, NEW.id, 'error', SQLERRM, applied);
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_run_task_automations_insert
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.run_task_automations();

CREATE TRIGGER trg_run_task_automations_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.run_task_automations();