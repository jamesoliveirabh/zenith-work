
CREATE TYPE public.change_type AS ENUM (
  'feature', 'bugfix', 'hotfix', 'config', 'infrastructure', 'security', 'docs'
);

CREATE TYPE public.risk_level AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE public.change_request_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'rejected', 'implemented', 'rolled_back', 'cancelled'
);

CREATE TYPE public.release_status AS ENUM (
  'planning', 'ready', 'staging', 'released', 'rolled_back', 'cancelled'
);

-- ===== Releases =====
CREATE TABLE public.releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
  version TEXT NOT NULL,
  name TEXT,
  description TEXT,
  status public.release_status NOT NULL DEFAULT 'planning',
  release_notes TEXT,
  target_date DATE,
  released_at TIMESTAMPTZ,
  deployed_by UUID,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID,
  rollback_reason TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, version)
);
CREATE INDEX idx_releases_ws_status ON public.releases(workspace_id, status);
CREATE INDEX idx_releases_sprint ON public.releases(sprint_id);

CREATE TRIGGER trg_releases_updated
BEFORE UPDATE ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Change Requests =====
CREATE TABLE public.change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  change_type public.change_type NOT NULL,
  risk_level public.risk_level NOT NULL DEFAULT 'low',
  impacted_areas TEXT[] NOT NULL DEFAULT '{}',
  rollback_plan TEXT,
  testing_plan TEXT,
  status public.change_request_status NOT NULL DEFAULT 'draft',
  requested_by UUID NOT NULL,
  related_entity_type public.approval_entity_type,
  related_entity_id UUID,
  target_release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  implemented_at TIMESTAMPTZ,
  implemented_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_requests_ws_status ON public.change_requests(workspace_id, status);
CREATE INDEX idx_change_requests_release ON public.change_requests(target_release_id);
CREATE INDEX idx_change_requests_requester ON public.change_requests(requested_by);

CREATE TRIGGER trg_change_requests_updated
BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Release Items =====
CREATE TABLE public.release_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('task','change_request','sprint','technical_debt')),
  item_id UUID NOT NULL,
  notes TEXT,
  added_by UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id, item_type, item_id)
);
CREATE INDEX idx_release_items_release ON public.release_items(release_id);
CREATE INDEX idx_release_items_item ON public.release_items(item_type, item_id);

-- ===== Task Audit Trail =====
CREATE TABLE public.task_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_audit_task ON public.task_audit_trail(task_id, created_at DESC);
CREATE INDEX idx_task_audit_ws ON public.task_audit_trail(workspace_id, created_at DESC);
CREATE INDEX idx_task_audit_actor ON public.task_audit_trail(actor_id);

-- ===== Task Audit Trigger =====
CREATE OR REPLACE FUNCTION public.audit_task_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'created',
            jsonb_build_object('title', NEW.title, 'status_id', NEW.status_id, 'priority', NEW.priority));
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, old_value)
    VALUES (OLD.id, OLD.workspace_id, auth.uid(), 'deleted',
            jsonb_build_object('title', OLD.title));
    RETURN OLD;
  END IF;

  IF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'status_changed', 'status_id',
            to_jsonb(OLD.status_id), to_jsonb(NEW.status_id));
  END IF;
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'assignee_changed', 'assignee_id',
            to_jsonb(OLD.assignee_id), to_jsonb(NEW.assignee_id));
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'priority_changed', 'priority',
            to_jsonb(OLD.priority), to_jsonb(NEW.priority));
  END IF;
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'due_date_changed', 'due_date',
            to_jsonb(OLD.due_date), to_jsonb(NEW.due_date));
  END IF;
  IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
    INSERT INTO public.task_audit_trail(task_id, workspace_id, actor_id, action, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.workspace_id, auth.uid(), 'moved', 'list_id',
            to_jsonb(OLD.list_id), to_jsonb(NEW.list_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.audit_task_changes();

-- ===== Change request status -> auto link approval =====
CREATE OR REPLACE FUNCTION public.change_request_status_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN NEW.approved_at := now(); END IF;
    IF NEW.status = 'implemented' THEN
      NEW.implemented_at := now();
      NEW.implemented_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_change_request_status
BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.change_request_status_audit();

-- ===== Release status timestamps =====
CREATE OR REPLACE FUNCTION public.release_status_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'released' AND NEW.released_at IS NULL THEN
      NEW.released_at := now();
      NEW.deployed_by := auth.uid();
    END IF;
    IF NEW.status = 'rolled_back' AND NEW.rolled_back_at IS NULL THEN
      NEW.rolled_back_at := now();
      NEW.rolled_back_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_release_status
BEFORE UPDATE ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.release_status_audit();

-- ===== RLS =====
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_audit_trail ENABLE ROW LEVEL SECURITY;

-- Releases
CREATE POLICY "releases: members can view" ON public.releases
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "releases: admins can insert" ON public.releases
FOR INSERT TO authenticated WITH CHECK (
  public.is_workspace_admin(workspace_id, auth.uid()) AND created_by = auth.uid()
);

CREATE POLICY "releases: admins can update" ON public.releases
FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "releases: admins can delete" ON public.releases
FOR DELETE TO authenticated
USING (
  public.is_workspace_admin(workspace_id, auth.uid())
  AND status IN ('planning', 'cancelled')
);

-- Change requests
CREATE POLICY "cr: members can view" ON public.change_requests
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "cr: members can create" ON public.change_requests
FOR INSERT TO authenticated WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid()) AND requested_by = auth.uid()
);

CREATE POLICY "cr: requester or admin can update" ON public.change_requests
FOR UPDATE TO authenticated
USING (
  (requested_by = auth.uid() AND status IN ('draft', 'pending_approval'))
  OR public.is_workspace_admin(workspace_id, auth.uid())
)
WITH CHECK (
  (requested_by = auth.uid() AND status IN ('draft', 'pending_approval', 'cancelled'))
  OR public.is_workspace_admin(workspace_id, auth.uid())
);

CREATE POLICY "cr: admins can delete" ON public.change_requests
FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Release items
CREATE POLICY "release_items: visible with parent" ON public.release_items
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.releases r
  WHERE r.id = release_id AND public.is_workspace_member(r.workspace_id, auth.uid())
));

CREATE POLICY "release_items: admins can write" ON public.release_items
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.releases r
  WHERE r.id = release_id AND public.is_workspace_admin(r.workspace_id, auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.releases r
  WHERE r.id = release_id AND public.is_workspace_admin(r.workspace_id, auth.uid())
));

-- Task audit trail (read-only for users; written by trigger)
CREATE POLICY "task_audit: members can view" ON public.task_audit_trail
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
