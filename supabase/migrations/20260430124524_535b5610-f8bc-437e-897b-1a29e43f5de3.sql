-- ── 1. Novos ENUMs ──────────────────────────────────────────
CREATE TYPE public.org_role AS ENUM ('admin', 'gestor', 'member');
CREATE TYPE public.team_role AS ENUM ('gestor', 'member');

-- ── 2. Tabela: teams ────────────────────────────────────────
CREATE TABLE public.teams (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  color         TEXT        NOT NULL DEFAULT '#6366f1',
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_teams_workspace ON public.teams(workspace_id);
CREATE TRIGGER trg_teams_updated
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Tabela: team_memberships ─────────────────────────────
CREATE TABLE public.team_memberships (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          public.team_role NOT NULL DEFAULT 'member',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_team_memberships_team    ON public.team_memberships(team_id);
CREATE INDEX idx_team_memberships_user    ON public.team_memberships(user_id);
CREATE INDEX idx_team_memberships_ws      ON public.team_memberships(workspace_id);

-- ── 4. Tabela: space_memberships ────────────────────────────
CREATE TABLE public.space_memberships (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      UUID        NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  team_id       UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space_id, user_id)
);
ALTER TABLE public.space_memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_space_memberships_space  ON public.space_memberships(space_id);
CREATE INDEX idx_space_memberships_user   ON public.space_memberships(user_id);
CREATE INDEX idx_space_memberships_team   ON public.space_memberships(team_id);

-- ── 5. Vincular spaces a teams ──────────────────────────────
ALTER TABLE public.spaces
  ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX idx_spaces_team ON public.spaces(team_id);

-- ── 6. Coluna org_role em workspace_members ─────────────────
ALTER TABLE public.workspace_members
  ADD COLUMN org_role public.org_role NOT NULL DEFAULT 'member';
UPDATE public.workspace_members SET org_role = 'admin' WHERE role = 'admin';

-- ── 7. Funções auxiliares SECURITY DEFINER ──────────────────
CREATE OR REPLACE FUNCTION public.is_org_admin(_ws UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _ws AND user_id = _user AND org_role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(_team UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE team_id = _team AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_gestor(_team UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE team_id = _team AND user_id = _user AND role = 'gestor'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_create_team(_ws UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _ws AND user_id = _user
      AND org_role IN ('admin', 'gestor')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_space(_space UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_memberships sm
    WHERE sm.space_id = _space AND sm.user_id = _user
  )
  OR EXISTS (
    SELECT 1 FROM public.spaces s
    JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id
    WHERE s.id = _space AND wm.user_id = _user AND wm.org_role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.spaces s
    JOIN public.team_memberships tm ON tm.team_id = s.team_id
    WHERE s.id = _space AND tm.user_id = _user AND tm.role = 'gestor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_of_space(_space UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.spaces s
    JOIN public.team_memberships tm ON tm.team_id = s.team_id
    WHERE s.id = _space AND tm.user_id = _user AND tm.role = 'gestor'
  )
  OR EXISTS (
    SELECT 1 FROM public.spaces s
    JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id
    WHERE s.id = _space AND wm.user_id = _user AND wm.org_role = 'admin'
  );
$$;

-- ── 8. Trigger: criador da equipe vira gestor automático ────
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.team_memberships (team_id, workspace_id, user_id, role)
    VALUES (NEW.id, NEW.workspace_id, NEW.created_by, 'gestor');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_new_team
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_team();

-- ── 9. Trigger: ao criar space, associar gestores da equipe ──
CREATE OR REPLACE FUNCTION public.handle_new_space_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_id IS NOT NULL AND NEW.created_by IS NOT NULL THEN
    INSERT INTO public.space_memberships (space_id, team_id, workspace_id, user_id)
    SELECT NEW.id, NEW.team_id, NEW.workspace_id, tm.user_id
    FROM public.team_memberships tm
    WHERE tm.team_id = NEW.team_id AND tm.role = 'gestor'
    ON CONFLICT (space_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_new_space_auto_membership
  AFTER INSERT ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_space_membership();

-- ── 10. RLS: teams ───────────────────────────────────────────
CREATE POLICY "Workspace members read teams"
  ON public.teams FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Org admin or gestor create teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (public.can_create_team(workspace_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Org admin or team gestor update team"
  ON public.teams FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(workspace_id, auth.uid())
    OR public.is_team_gestor(id, auth.uid())
  );

CREATE POLICY "Org admin delete team"
  ON public.teams FOR DELETE TO authenticated
  USING (public.is_org_admin(workspace_id, auth.uid()));

-- ── 11. RLS: team_memberships ────────────────────────────────
CREATE POLICY "Team members read memberships"
  ON public.team_memberships FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Org admin or gestor add team members"
  ON public.team_memberships FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(workspace_id, auth.uid())
    OR public.is_team_gestor(team_id, auth.uid())
  );

CREATE POLICY "Org admin or gestor update team members"
  ON public.team_memberships FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(workspace_id, auth.uid())
    OR public.is_team_gestor(team_id, auth.uid())
  );

CREATE POLICY "Org admin or gestor remove team members"
  ON public.team_memberships FOR DELETE TO authenticated
  USING (
    public.is_org_admin(workspace_id, auth.uid())
    OR public.is_team_gestor(team_id, auth.uid())
  );

-- ── 12. RLS: space_memberships ───────────────────────────────
CREATE POLICY "Team members read space memberships"
  ON public.space_memberships FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Gestor manages space memberships insert"
  ON public.space_memberships FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gestor_of_space(space_id, auth.uid())
    OR public.is_org_admin(workspace_id, auth.uid())
  );

CREATE POLICY "Gestor manages space memberships delete"
  ON public.space_memberships FOR DELETE TO authenticated
  USING (
    public.is_gestor_of_space(space_id, auth.uid())
    OR public.is_org_admin(workspace_id, auth.uid())
  );

-- ── 13. Atualizar RLS de spaces para respeitar team_id ───────
DROP POLICY IF EXISTS "Writers create spaces" ON public.spaces;
DROP POLICY IF EXISTS "Writers update spaces" ON public.spaces;
DROP POLICY IF EXISTS "Admins or owner delete spaces" ON public.spaces;

CREATE POLICY "Gestor creates spaces in own team"
  ON public.spaces FOR INSERT TO authenticated
  WITH CHECK (
    (
      team_id IS NOT NULL
      AND public.is_team_gestor(team_id, auth.uid())
    )
    OR public.is_org_admin(workspace_id, auth.uid())
  );

CREATE POLICY "Gestor updates spaces in own team"
  ON public.spaces FOR UPDATE TO authenticated
  USING (public.is_gestor_of_space(id, auth.uid()));

CREATE POLICY "Gestor or org admin deletes space"
  ON public.spaces FOR DELETE TO authenticated
  USING (public.is_gestor_of_space(id, auth.uid()));

-- ── 14. Revogar EXECUTE das novas funções trigger ────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_team()                  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_space_membership()      FROM anon, authenticated, public;