-- 1) Ensure every workspace with orphan spaces has a "Geral" team, then attach orphans to it
DO $$
DECLARE
  ws RECORD;
  geral_id uuid;
BEGIN
  FOR ws IN
    SELECT DISTINCT workspace_id FROM public.spaces WHERE team_id IS NULL
  LOOP
    SELECT id INTO geral_id
    FROM public.teams
    WHERE workspace_id = ws.workspace_id AND name = 'Geral'
    LIMIT 1;

    IF geral_id IS NULL THEN
      INSERT INTO public.teams (workspace_id, name, description, color, created_by)
      VALUES (
        ws.workspace_id,
        'Geral',
        'Equipe padrão para spaces existentes',
        '#94a3b8',
        (SELECT user_id FROM public.workspace_members
          WHERE workspace_id = ws.workspace_id AND org_role = 'admin'
          ORDER BY created_at ASC LIMIT 1)
      )
      RETURNING id INTO geral_id;
    END IF;

    UPDATE public.spaces
    SET team_id = geral_id
    WHERE workspace_id = ws.workspace_id AND team_id IS NULL;
  END LOOP;
END $$;

-- 2) Enforce NOT NULL on spaces.team_id
ALTER TABLE public.spaces
  ALTER COLUMN team_id SET NOT NULL;

-- 3) Make space deletion cascade with team deletion
ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_team_id_fkey;

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;