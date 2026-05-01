-- Patch: tolerate trigger-created workspace_members rows
DO $patch$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public._seed_homolog_run(boolean)'::regprocedure) INTO v_src;
  v_src := replace(
    v_src,
    $a$INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role)
    VALUES (v_ws_id, v_ws_owner, 'admin'::workspace_role, 'admin'::org_role);$a$,
    $b$INSERT INTO public.workspace_members (workspace_id, user_id, role, org_role)
    VALUES (v_ws_id, v_ws_owner, 'admin'::workspace_role, 'admin'::org_role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;$b$
  );
  EXECUTE v_src;
END $patch$;

REVOKE ALL ON FUNCTION public._seed_homolog_run(boolean) FROM anon, authenticated;