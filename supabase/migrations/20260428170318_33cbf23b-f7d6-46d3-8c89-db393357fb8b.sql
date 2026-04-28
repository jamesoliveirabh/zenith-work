
-- ============ ENUMS ============
CREATE TYPE public.workspace_role AS ENUM ('admin', 'member', 'guest');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ WORKSPACES ============
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MEMBERS ============
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_members_ws ON public.workspace_members(workspace_id);

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_ws UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_ws UUID, _user UUID)
RETURNS public.workspace_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE workspace_id = _ws AND user_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.can_write_workspace(_ws UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _ws AND user_id = _user AND role IN ('admin','member'));
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_ws UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _ws AND user_id = _user AND role = 'admin');
$$;

-- Workspace policies
CREATE POLICY "Members read workspaces"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "Authenticated create workspaces"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Admins update workspaces"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(id, auth.uid()));
CREATE POLICY "Owner deletes workspace"
  ON public.workspaces FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Auto-add creator as admin
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_new_workspace AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();

-- Members policies
CREATE POLICY "Members read members of their workspaces"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins add members"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Admins update members"
  ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Admins remove members"
  ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
-- Allow trigger insert by bypassing? Trigger runs as definer so it bypasses RLS — ok.

-- ============ SPACES ============
CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_spaces_ws ON public.spaces(workspace_id);
CREATE TRIGGER trg_spaces_updated BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Members read spaces" ON public.spaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Writers create spaces" ON public.spaces FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers update spaces" ON public.spaces FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Admins delete spaces" ON public.spaces FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- ============ LISTS ============
CREATE TABLE public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#64748b',
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_lists_space ON public.lists(space_id);
CREATE INDEX idx_lists_ws ON public.lists(workspace_id);
CREATE TRIGGER trg_lists_updated BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Members read lists" ON public.lists FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Writers create lists" ON public.lists FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers update lists" ON public.lists FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers delete lists" ON public.lists FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

-- ============ STATUS COLUMNS (custom statuses per list) ============
CREATE TABLE public.status_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#64748b',
  position INT NOT NULL DEFAULT 0,
  is_done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.status_columns ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_status_list ON public.status_columns(list_id);

CREATE POLICY "Members read statuses" ON public.status_columns FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Writers manage statuses insert" ON public.status_columns FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers manage statuses update" ON public.status_columns FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers manage statuses delete" ON public.status_columns FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

-- Default statuses on new list
CREATE OR REPLACE FUNCTION public.handle_new_list()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.status_columns (list_id, workspace_id, name, color, position, is_done) VALUES
    (NEW.id, NEW.workspace_id, 'To Do', '#94a3b8', 0, false),
    (NEW.id, NEW.workspace_id, 'In Progress', '#3b82f6', 1, false),
    (NEW.id, NEW.workspace_id, 'Done', '#22c55e', 2, true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_new_list AFTER INSERT ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_list();

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  status_id UUID REFERENCES public.status_columns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  position INT NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_list ON public.tasks(list_id);
CREATE INDEX idx_tasks_ws ON public.tasks(workspace_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_parent ON public.tasks(parent_task_id);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Members read tasks" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Writers create tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "Writers delete tasks" ON public.tasks FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

-- ============ COMMENTS ============
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_comments_task ON public.task_comments(task_id);

CREATE POLICY "Members read comments" ON public.task_comments FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Writers create comments" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()) AND auth.uid() = author_id);
CREATE POLICY "Authors update own comments" ON public.task_comments FOR UPDATE TO authenticated
  USING (auth.uid() = author_id);
CREATE POLICY "Authors delete own comments" ON public.task_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.is_workspace_admin(workspace_id, auth.uid()));

-- ============ WATCHERS ============
CREATE TABLE public.task_watchers (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read watchers" ON public.task_watchers FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members insert watchers" ON public.task_watchers FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members delete watchers" ON public.task_watchers FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_workspace_admin(workspace_id, auth.uid()));
