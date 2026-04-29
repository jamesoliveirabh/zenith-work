-- Per-list role permission overrides
CREATE TABLE public.list_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  list_id UUID NOT NULL,
  role public.workspace_role NOT NULL,
  permission_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, role, permission_key)
);

CREATE INDEX idx_list_role_perms_lookup ON public.list_role_permissions(list_id, role, permission_key);

ALTER TABLE public.list_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read list role perms"
  ON public.list_role_permissions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins insert list role perms"
  ON public.list_role_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update list role perms"
  ON public.list_role_permissions FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete list role perms"
  ON public.list_role_permissions FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER trg_list_role_perms_updated
  BEFORE UPDATE ON public.list_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit changes
CREATE OR REPLACE FUNCTION public.audit_list_role_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.workspace_id, 'list_permission.override_created', 'list_role_permission', NEW.list_id,
      jsonb_build_object('role', NEW.role, 'key', NEW.permission_key, 'enabled', NEW.enabled));
  ELSIF TG_OP = 'UPDATE' AND NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    PERFORM public.log_audit(NEW.workspace_id, 'list_permission.override_changed', 'list_role_permission', NEW.list_id,
      jsonb_build_object('role', NEW.role, 'key', NEW.permission_key, 'from', OLD.enabled, 'to', NEW.enabled));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.workspace_id, 'list_permission.override_removed', 'list_role_permission', OLD.list_id,
      jsonb_build_object('role', OLD.role, 'key', OLD.permission_key));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_list_role_perms
  AFTER INSERT OR UPDATE OR DELETE ON public.list_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_list_role_permissions();

-- New RPC: has_permission_for_list. Override on list takes precedence over workspace default.
CREATE OR REPLACE FUNCTION public.has_permission_for_list(_user uuid, _list uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws UUID;
  user_role public.workspace_role;
  override_val BOOLEAN;
  base_val BOOLEAN;
BEGIN
  SELECT workspace_id INTO ws FROM public.lists WHERE id = _list;
  IF ws IS NULL THEN RETURN false; END IF;

  SELECT role INTO user_role FROM public.workspace_members
    WHERE workspace_id = ws AND user_id = _user;
  IF user_role IS NULL THEN RETURN false; END IF;

  -- Admins always allowed
  IF user_role = 'admin' THEN RETURN true; END IF;

  -- Per-list override wins
  SELECT enabled INTO override_val FROM public.list_role_permissions
    WHERE list_id = _list AND role = user_role AND permission_key = _key;
  IF override_val IS NOT NULL THEN RETURN override_val; END IF;

  -- Fall back to workspace default
  SELECT enabled INTO base_val FROM public.role_permissions
    WHERE workspace_id = ws AND role = user_role AND permission_key = _key;
  RETURN COALESCE(base_val, false);
END;
$$;