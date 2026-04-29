
-- Permission keys catalog (fixed)
CREATE TABLE public.permission_catalog (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.permission_catalog(key, category, label, description, position) VALUES
('manage_users', 'Administração', 'Gerenciar usuários', 'Visualizar e gerenciar membros e convidados do workspace, incluindo adicionar, remover e alterar papéis.', 1),
('manage_invitations', 'Administração', 'Gerenciar convites', 'Enviar, reenviar e revogar convites de novos usuários.', 2),
('manage_teams', 'Administração', 'Gerenciar spaces e listas', 'Criar, editar e excluir spaces e listas, bem como gerenciar seus membros.', 3),
('manage_permissions', 'Administração', 'Gerenciar permissões', 'Alterar as permissões de cada papel e configurar privacidade de listas.', 4),
('view_audit_log', 'Administração', 'Ver logs de auditoria', 'Acessar o histórico de ações sensíveis no workspace.', 5),
('edit_statuses', 'Configuração', 'Editar status', 'Criar, editar e excluir colunas de status nas listas.', 10),
('manage_tags', 'Configuração', 'Gerenciar tags', 'Criar, editar e excluir tags de tarefas.', 11),
('manage_custom_fields', 'Configuração', 'Gerenciar campos personalizados', 'Criar, editar e excluir campos personalizados das listas.', 12),
('manage_automations', 'Configuração', 'Gerenciar automações', 'Criar, editar e excluir regras de automação.', 13),
('create_tasks', 'Tarefas', 'Criar tarefas', 'Criar novas tarefas nas listas em que tem acesso.', 20),
('delete_tasks', 'Tarefas', 'Excluir tarefas', 'Remover tarefas das listas. Sem essa permissão, o usuário só consegue arquivar.', 21),
('comment_tasks', 'Tarefas', 'Comentar', 'Adicionar comentários e participar de discussões em tarefas.', 22),
('export_data', 'Dados', 'Exportar dados', 'Baixar exportações de tarefas, comentários e relatórios.', 30);

ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog readable by authenticated"
ON public.permission_catalog FOR SELECT TO authenticated USING (true);

-- Per-workspace overrides
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  role public.workspace_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (workspace_id, role, permission_key)
);
CREATE INDEX idx_role_perm_ws ON public.role_permissions(workspace_id);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read role permissions"
ON public.role_permissions FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins insert role permissions"
ON public.role_permissions FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins update role permissions"
ON public.role_permissions FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins delete role permissions"
ON public.role_permissions FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Default seed function
CREATE OR REPLACE FUNCTION public.seed_role_permissions(_ws UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Admin: all enabled
  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'admin'::public.workspace_role, key, true FROM public.permission_catalog
  ON CONFLICT DO NOTHING;

  -- Member: operation + collaboration, not admin areas
  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'member'::public.workspace_role, key,
    key IN ('edit_statuses','manage_tags','create_tasks','delete_tasks','comment_tasks','export_data','manage_custom_fields','manage_automations')
  FROM public.permission_catalog
  ON CONFLICT DO NOTHING;

  -- Guest: read + comment only
  INSERT INTO public.role_permissions(workspace_id, role, permission_key, enabled)
  SELECT _ws, 'guest'::public.workspace_role, key,
    key IN ('comment_tasks')
  FROM public.permission_catalog
  ON CONFLICT DO NOTHING;
END;
$$;

-- Seed for all existing workspaces
DO $$
DECLARE w RECORD;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_role_permissions(w.id);
  END LOOP;
END $$;

-- Auto-seed on workspace creation
CREATE OR REPLACE FUNCTION public.seed_role_permissions_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_role_permissions(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_seed_role_permissions
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.seed_role_permissions_trigger();

-- Has-permission helper
CREATE OR REPLACE FUNCTION public.has_permission(_user UUID, _ws UUID, _key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.role_permissions rp
      ON rp.workspace_id = wm.workspace_id
     AND rp.role = wm.role
    WHERE wm.workspace_id = _ws
      AND wm.user_id = _user
      AND rp.permission_key = _key
      AND rp.enabled = true
  );
$$;

-- Audit role_permissions changes
CREATE OR REPLACE FUNCTION public.audit_role_permissions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    PERFORM public.log_audit(NEW.workspace_id, 'permission.role_changed', 'role_permission', NULL,
      jsonb_build_object('role', NEW.role, 'key', NEW.permission_key, 'enabled', NEW.enabled));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_audit_role_permissions
AFTER UPDATE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_role_permissions();
