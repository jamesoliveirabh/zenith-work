DO $patch$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public._seed_homolog_run(boolean)'::regprocedure) INTO v_src;
  v_src := replace(v_src,
    $a$        WHEN v_ws_scenario='past_due' AND v_j <= 2 THEN 'past_due'$a$,
    $b$        WHEN v_ws_scenario='past_due' AND v_j <= 2 THEN 'open'$b$);
  EXECUTE v_src;
END $patch$;
REVOKE ALL ON FUNCTION public._seed_homolog_run(boolean) FROM anon, authenticated;