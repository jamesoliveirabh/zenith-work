
-- ============= MODULE 9: SECURITY & PERMISSIONS =============

-- 1) AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,            -- e.g. 'member.invited','member.removed','role.changed','list.created','list.deleted','task.deleted','permission.changed','automation.created'
  entity_type TEXT NOT NULL,       -- 'workspace','member','invitation','list','task','automation','list_permission'
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_ws_created ON public.audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- inserts only by triggers (security definer)
CREATE POLICY "No direct inserts on audit_logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (false);

-- 2) LIST PERMISSIONS (restrict access to specific lists)
CREATE TYPE public.list_access_level AS ENUM ('view','edit','admin');

CREATE TABLE public.list_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  list_id UUID NOT NULL,
  user_id UUID NOT NULL,
  access_level public.list_access_level NOT NULL DEFAULT 'view',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, user_id)
);
CREATE INDEX idx_list_perm_list ON public.list_permissions(list_id);
CREATE INDEX idx_list_perm_user ON public.list_permissions(user_id);

ALTER TABLE public.list_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read list permissions"
ON public.list_permissions FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins insert list permissions"
ON public.list_permissions FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update list permissions"
ON public.list_permissions FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete list permissions"
ON public.list_permissions FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Helper: is the list "private" (has any permissions row)?
CREATE OR REPLACE FUNCTION public.list_is_restricted(_list_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.list_permissions WHERE list_id = _list_id);
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_list(_list_id UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- Workspace admins always have access
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = _list_id
        AND public.is_workspace_admin(l.workspace_id, _user)
    )
    OR
    -- Not restricted -> any workspace member with write/read access
    (
      NOT public.list_is_restricted(_list_id)
      AND EXISTS (
        SELECT 1 FROM public.lists l
        WHERE l.id = _list_id
          AND public.is_workspace_member(l.workspace_id, _user)
      )
    )
    OR
    -- Restricted -> must be in list_permissions
    EXISTS (SELECT 1 FROM public.list_permissions WHERE list_id = _list_id AND user_id = _user);
$$;

-- 3) AUDIT TRIGGERS (workspace_members, workspace_invitations, lists, list_permissions)
CREATE OR REPLACE FUNCTION public.log_audit(
  _ws UUID, _action TEXT, _entity_type TEXT, _entity_id UUID, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uemail TEXT;
BEGIN
  SELECT email INTO uemail FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_logs(workspace_id, actor_id, actor_email, action, entity_type, entity_id, metadata)
  VALUES (_ws, auth.uid(), uemail, _action, _entity_type, _entity_id, COALESCE(_metadata,'{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_workspace_members()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'member.added', 'member', NEW.user_id,
      jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.log_audit(NEW.workspace_id, 'role.changed', 'member', NEW.user_id,
      jsonb_build_object('from', OLD.role, 'to', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.workspace_id, 'member.removed', 'member', OLD.user_id,
      jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_audit_workspace_members
AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.audit_workspace_members();

CREATE OR REPLACE FUNCTION public.audit_workspace_invitations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'member.invited', 'invitation', NEW.id,
      jsonb_build_object('email', NEW.email, 'role', NEW.role));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_audit(NEW.workspace_id, 'invitation.' || NEW.status, 'invitation', NEW.id,
      jsonb_build_object('email', NEW.email));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.workspace_id, 'invitation.revoked', 'invitation', OLD.id,
      jsonb_build_object('email', OLD.email));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_audit_workspace_invitations
AFTER INSERT OR UPDATE OR DELETE ON public.workspace_invitations
FOR EACH ROW EXECUTE FUNCTION public.audit_workspace_invitations();

CREATE OR REPLACE FUNCTION public.audit_lists()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'list.created', 'list', NEW.id, jsonb_build_object('name', NEW.name));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.workspace_id, 'list.deleted', 'list', OLD.id, jsonb_build_object('name', OLD.name));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_audit_lists
AFTER INSERT OR DELETE ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.audit_lists();

CREATE OR REPLACE FUNCTION public.audit_list_permissions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'permission.granted', 'list_permission', NEW.list_id,
      jsonb_build_object('user_id', NEW.user_id, 'access_level', NEW.access_level));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'permission.changed', 'list_permission', NEW.list_id,
      jsonb_build_object('user_id', NEW.user_id, 'from', OLD.access_level, 'to', NEW.access_level));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.workspace_id, 'permission.revoked', 'list_permission', OLD.list_id,
      jsonb_build_object('user_id', OLD.user_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_audit_list_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.list_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_list_permissions();
