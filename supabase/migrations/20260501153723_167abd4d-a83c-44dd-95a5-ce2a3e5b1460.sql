DO $patch$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public._seed_homolog_run(boolean)'::regprocedure) INTO v_src;

  -- Replace status_ids loop: iterate integer index, not uuid
  v_src := replace(v_src,
    $a$        v_status_ids := ARRAY[]::uuid[];
        FOR v_status_id IN SELECT gen_random_uuid() FROM generate_series(1, jsonb_array_length(v_status_set))
        LOOP
          v_status_ids := array_append(v_status_ids, v_status_id);
        END LOOP;$a$,
    $b$        v_status_ids := ARRAY[]::uuid[];
        FOR v_idx IN 1..jsonb_array_length(v_status_set) LOOP
          v_status_ids := array_append(v_status_ids, gen_random_uuid());
        END LOOP;$b$);

  -- Replace inner comments loop: use integer var, not uuid
  v_src := replace(v_src,
    $a$          FOR v_status_id IN SELECT generate_series(1, (v_k % 4)) LOOP
            INSERT INTO public.task_comments (task_id, workspace_id, author_id, body, created_at)
            VALUES (
              v_task_id, v_ws_id,
              v_ws_members[1 + ((v_k + v_status_id::int) % array_length(v_ws_members,1))],
              v_comment_seeds[1 + ((v_k * v_status_id::int) % array_length(v_comment_seeds,1))],
              v_t + ((v_status_id::int) || ' hours')::interval
            );
          END LOOP;$a$,
    $b$          FOR v_idx IN 1..(v_k % 4) LOOP
            INSERT INTO public.task_comments (task_id, workspace_id, author_id, body, created_at)
            VALUES (
              v_task_id, v_ws_id,
              v_ws_members[1 + ((v_k + v_idx) % array_length(v_ws_members,1))],
              v_comment_seeds[1 + ((v_k * v_idx) % array_length(v_comment_seeds,1))],
              v_t + (v_idx || ' hours')::interval
            );
          END LOOP;$b$);

  -- Add v_idx declaration
  v_src := replace(v_src,
    $a$  v_status_ids   uuid[];$a$,
    $b$  v_status_ids   uuid[];
  v_idx          int;$b$);

  EXECUTE v_src;
END $patch$;

REVOKE ALL ON FUNCTION public._seed_homolog_run(boolean) FROM anon, authenticated;