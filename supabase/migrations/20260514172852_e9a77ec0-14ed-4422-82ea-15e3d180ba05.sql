
-- 1. public.users com global_role
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  global_role TEXT DEFAULT 'user' CHECK (global_role IN ('superadmin', 'admin', 'gestor', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Popular users a partir de auth.users + profiles (best-effort)
INSERT INTO public.users (id, email, full_name, global_role)
SELECT au.id,
       COALESCE(p.email, au.email, au.id::text || '@unknown.local'),
       p.display_name,
       CASE WHEN p.is_platform_admin THEN 'superadmin' ELSE 'user' END
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
ON CONFLICT (id) DO NOTHING;

-- 2. workspaces.created_by_role (owner_id já existe)
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by_role TEXT CHECK (created_by_role IN ('admin','gestor'));

-- 3. workspace_members.invited_by, status
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'accepted' CHECK (status IN ('pending','accepted','rejected'));

-- 4. audit_logs (já existe com schema diferente; adicionar colunas faltantes se aplicável)
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id UUID,
  ADD COLUMN IF NOT EXISTS changes JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON public.workspace_members(role);

-- 5. RLS

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Helper: get global_role (SECURITY DEFINER, evita recursão)
CREATE OR REPLACE FUNCTION public.get_global_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT global_role FROM public.users WHERE id = _user_id
$$;

-- users
DROP POLICY IF EXISTS "users_select_own_or_superadmin" ON public.users;
CREATE POLICY "users_select_own_or_superadmin" ON public.users
  FOR SELECT
  USING (auth.uid() = id OR public.get_global_role(auth.uid()) = 'superadmin');

DROP POLICY IF EXISTS "users_insert_self" ON public.users;
CREATE POLICY "users_insert_self" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_self_or_superadmin" ON public.users;
CREATE POLICY "users_update_self_or_superadmin" ON public.users
  FOR UPDATE USING (auth.uid() = id OR public.get_global_role(auth.uid()) = 'superadmin');

-- workspaces
DROP POLICY IF EXISTS "workspace_select_own_or_superadmin" ON public.workspaces;
CREATE POLICY "workspace_select_own_or_superadmin" ON public.workspaces
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_workspace_member(id, auth.uid())
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "workspace_create_admin_gestor" ON public.workspaces;
CREATE POLICY "workspace_create_admin_gestor" ON public.workspaces
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND public.get_global_role(auth.uid()) IN ('admin','gestor','superadmin')
  );

DROP POLICY IF EXISTS "workspace_update_owner_or_superadmin" ON public.workspaces;
CREATE POLICY "workspace_update_owner_or_superadmin" ON public.workspaces
  FOR UPDATE
  USING (owner_id = auth.uid() OR public.get_global_role(auth.uid()) = 'superadmin')
  WITH CHECK (owner_id = auth.uid() OR public.get_global_role(auth.uid()) = 'superadmin');

DROP POLICY IF EXISTS "workspace_delete_admin_or_superadmin" ON public.workspaces;
CREATE POLICY "workspace_delete_admin_or_superadmin" ON public.workspaces
  FOR DELETE
  USING (
    (owner_id = auth.uid() AND public.get_global_role(auth.uid()) = 'admin')
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

-- workspace_members
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "workspace_members_insert_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_admin" ON public.workspace_members
  FOR INSERT
  WITH CHECK (
    (
      EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
      AND public.get_global_role(auth.uid()) = 'admin'
      AND role::text IN ('gestor','member','guest')
    )
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "workspace_members_insert_gestor" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_gestor" ON public.workspace_members
  FOR INSERT
  WITH CHECK (
    (
      EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
      AND public.get_global_role(auth.uid()) = 'gestor'
      AND role::text IN ('member','guest')
    )
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;
CREATE POLICY "workspace_members_delete" ON public.workspace_members
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
    OR public.get_global_role(auth.uid()) = 'superadmin'
  );

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT
  USING (actor_id = auth.uid() OR public.get_global_role(auth.uid()) = 'superadmin');

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (actor_id = auth.uid());

-- Trigger para criar users automaticamente quando profile criar
CREATE OR REPLACE FUNCTION public.sync_user_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, global_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@unknown.local'),
    NEW.display_name,
    CASE WHEN NEW.is_platform_admin THEN 'superadmin' ELSE 'user' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    global_role = CASE
      WHEN NEW.is_platform_admin THEN 'superadmin'
      ELSE public.users.global_role
    END,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_from_profile_trg ON public.profiles;
CREATE TRIGGER sync_user_from_profile_trg
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_from_profile();
