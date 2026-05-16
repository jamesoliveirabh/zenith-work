
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TYPE public.approval_entity_type AS ENUM (
  'task', 'sprint', 'technical_debt', 'tech_spike', 'pull_request', 'time_entry', 'goal', 'custom'
);

CREATE TYPE public.approval_request_status AS ENUM (
  'pending', 'approved', 'rejected', 'cancelled', 'expired'
);

CREATE TYPE public.approval_step_decision AS ENUM (
  'pending', 'approved', 'rejected', 'skipped'
);

CREATE TYPE public.approval_approver_type AS ENUM (
  'user', 'workspace_role', 'team_role', 'team_member'
);

CREATE TABLE public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  entity_type public.approval_entity_type NOT NULL,
  trigger_condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_approve_requester BOOLEAN NOT NULL DEFAULT false,
  expires_after_hours INTEGER,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_workflows_ws ON public.approval_workflows(workspace_id);
CREATE INDEX idx_approval_workflows_team ON public.approval_workflows(team_id);
CREATE INDEX idx_approval_workflows_entity ON public.approval_workflows(entity_type, is_active);

CREATE TABLE public.approval_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  approver_type public.approval_approver_type NOT NULL,
  approver_user_id UUID,
  approver_role TEXT,
  approver_team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  required_approvals INTEGER NOT NULL DEFAULT 1 CHECK (required_approvals >= 1),
  allow_self_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);
CREATE INDEX idx_approval_steps_wf ON public.approval_workflow_steps(workflow_id, step_order);

CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE RESTRICT,
  entity_type public.approval_entity_type NOT NULL,
  entity_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  current_step_order INTEGER NOT NULL DEFAULT 1,
  status public.approval_request_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_requests_ws_status ON public.approval_requests(workspace_id, status);
CREATE INDEX idx_approval_requests_entity ON public.approval_requests(entity_type, entity_id);
CREATE INDEX idx_approval_requests_requester ON public.approval_requests(requested_by);

CREATE TABLE public.approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.approval_workflow_steps(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_id UUID NOT NULL,
  decision public.approval_step_decision NOT NULL,
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, step_id, approver_id)
);
CREATE INDEX idx_approval_decisions_req ON public.approval_decisions(request_id);
CREATE INDEX idx_approval_decisions_approver ON public.approval_decisions(approver_id);

CREATE TABLE public.approval_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  actor_id UUID,
  event_type TEXT NOT NULL,
  from_status public.approval_request_status,
  to_status public.approval_request_status,
  step_order INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_audit_req ON public.approval_audit_logs(request_id);
CREATE INDEX idx_approval_audit_ws ON public.approval_audit_logs(workspace_id, created_at DESC);

CREATE TRIGGER trg_approval_workflows_updated
BEFORE UPDATE ON public.approval_workflows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_approval_requests_updated
BEFORE UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_step_approver(_step_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.approval_workflow_steps%ROWTYPE;
  w public.approval_workflows%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.approval_workflow_steps WHERE id = _step_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  SELECT * INTO w FROM public.approval_workflows WHERE id = s.workflow_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF s.approver_type = 'user' THEN
    RETURN s.approver_user_id = _user_id;
  ELSIF s.approver_type = 'workspace_role' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = w.workspace_id AND wm.user_id = _user_id
        AND (wm.role::text = s.approver_role OR wm.org_role::text = s.approver_role)
    );
  ELSIF s.approver_type = 'team_role' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = COALESCE(s.approver_team_id, w.team_id)
        AND tm.user_id = _user_id AND tm.role::text = s.approver_role
    );
  ELSIF s.approver_type = 'team_member' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = COALESCE(s.approver_team_id, w.team_id) AND tm.user_id = _user_id
    );
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_approval_request_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.approval_audit_logs(request_id, workspace_id, actor_id, event_type, to_status, step_order, metadata)
    VALUES (NEW.id, NEW.workspace_id, NEW.requested_by, 'created', NEW.status, NEW.current_step_order,
            jsonb_build_object('entity_type', NEW.entity_type, 'entity_id', NEW.entity_id));
  ELSIF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.current_step_order IS DISTINCT FROM NEW.current_step_order) THEN
    INSERT INTO public.approval_audit_logs(request_id, workspace_id, actor_id, event_type, from_status, to_status, step_order, metadata)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'status_change', OLD.status, NEW.status, NEW.current_step_order, '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_approval_request_audit
AFTER INSERT OR UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.log_approval_request_change();

CREATE OR REPLACE FUNCTION public.log_approval_decision()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.approval_requests WHERE id = NEW.request_id;
  INSERT INTO public.approval_audit_logs(request_id, workspace_id, actor_id, event_type, step_order, metadata)
  VALUES (NEW.request_id, v_ws, NEW.approver_id, 'decision_' || NEW.decision::text, NEW.step_order,
          jsonb_build_object('comment', NEW.comment));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_approval_decision_audit
AFTER INSERT ON public.approval_decisions
FOR EACH ROW EXECUTE FUNCTION public.log_approval_decision();

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows: members can view" ON public.approval_workflows
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workflows: admins manage" ON public.approval_workflows
FOR ALL TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "steps: visible with parent workflow" ON public.approval_workflow_steps
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.approval_workflows w
  WHERE w.id = workflow_id AND public.is_workspace_member(w.workspace_id, auth.uid())
));

CREATE POLICY "steps: admins manage" ON public.approval_workflow_steps
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.approval_workflows w WHERE w.id = workflow_id AND public.is_workspace_admin(w.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.approval_workflows w WHERE w.id = workflow_id AND public.is_workspace_admin(w.workspace_id, auth.uid())));

CREATE POLICY "requests: members can view" ON public.approval_requests
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "requests: members can create" ON public.approval_requests
FOR INSERT TO authenticated WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid()) AND requested_by = auth.uid()
);

CREATE POLICY "requests: requester or admin can update" ON public.approval_requests
FOR UPDATE TO authenticated
USING (requested_by = auth.uid() OR public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (requested_by = auth.uid() OR public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "requests: admins can delete" ON public.approval_requests
FOR DELETE TO authenticated USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "decisions: visible with parent request" ON public.approval_decisions
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.approval_requests r
  WHERE r.id = request_id AND public.is_workspace_member(r.workspace_id, auth.uid())
));

CREATE POLICY "decisions: only approver can insert" ON public.approval_decisions
FOR INSERT TO authenticated WITH CHECK (
  approver_id = auth.uid()
  AND public.is_step_approver(step_id, auth.uid())
  AND EXISTS (SELECT 1 FROM public.approval_requests r WHERE r.id = request_id AND r.status = 'pending')
);

CREATE POLICY "audit: members can view" ON public.approval_audit_logs
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
