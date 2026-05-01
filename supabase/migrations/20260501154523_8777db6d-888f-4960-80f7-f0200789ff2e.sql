DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public._seed_homolog_run(boolean)'::regprocedure) INTO v_def;
  v_def := replace(v_def, $q$'scan', 'invoice_paid_subscription_past_due', 'warning'$q$,
                          $q$'scan', 'invoice_paid_subscription_past_due', 'medium'$q$);
  EXECUTE v_def;
END $$;