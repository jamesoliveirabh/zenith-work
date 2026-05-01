
-- Phase P7: Exports infrastructure

CREATE TABLE IF NOT EXISTS public.platform_admin_exports_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'ui',
  actor_user_id uuid,
  actor_email text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_exports_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read exports log"
ON public.platform_admin_exports_log
FOR SELECT TO authenticated
USING (public.is_any_platform_admin(auth.uid()));

CREATE POLICY "no direct insert exports log"
ON public.platform_admin_exports_log
FOR INSERT TO authenticated
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_exports_log_created_at
  ON public.platform_admin_exports_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_log_dataset
  ON public.platform_admin_exports_log (dataset, created_at DESC);

-- Internal helper: log an export run
CREATE OR REPLACE FUNCTION public._platform_admin_log_export(
  _dataset text,
  _filters jsonb,
  _row_count integer,
  _source text DEFAULT 'ui'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.platform_admin_exports_log
    (dataset, filters, row_count, source, actor_user_id, actor_email)
  VALUES
    (_dataset, COALESCE(_filters, '{}'::jsonb), COALESCE(_row_count, 0), COALESCE(_source, 'ui'), v_uid, v_email)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============ EXPORT: CLIENTS ============
CREATE OR REPLACE FUNCTION public.platform_admin_export_clients(
  _search text DEFAULT NULL,
  _plan_code text DEFAULT NULL,
  _sub_status text DEFAULT NULL,
  _suspended_only boolean DEFAULT false,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _source text DEFAULT 'ui'
)
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  workspace_created_at timestamptz,
  is_suspended boolean,
  suspended_at timestamptz,
  owner_email text,
  owner_name text,
  plan_code text,
  plan_name text,
  sub_status text,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  member_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.slug AS workspace_slug,
      w.created_at AS workspace_created_at,
      COALESCE(w.is_suspended, false) AS is_suspended,
      w.suspended_at,
      p.email AS owner_email,
      p.display_name AS owner_name,
      pl.code AS plan_code,
      pl.name AS plan_name,
      s.status::text AS sub_status,
      s.current_period_end,
      s.trial_ends_at,
      (SELECT COUNT(*)::int FROM public.workspace_members wm WHERE wm.workspace_id = w.id) AS member_count
    FROM public.workspaces w
    LEFT JOIN public.profiles p ON p.id = w.owner_id
    LEFT JOIN public.subscriptions s ON s.workspace_id = w.id
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
    WHERE
      (_search IS NULL OR w.name ILIKE '%'||_search||'%' OR p.email ILIKE '%'||_search||'%' OR w.id::text = _search)
      AND (_plan_code IS NULL OR pl.code = _plan_code)
      AND (_sub_status IS NULL OR s.status::text = _sub_status)
      AND (_suspended_only IS FALSE OR w.is_suspended = true)
      AND (_created_after IS NULL OR w.created_at >= _created_after)
      AND (_created_before IS NULL OR w.created_at <= _created_before)
  )
  SELECT * FROM rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._platform_admin_log_export(
    'clients',
    jsonb_build_object('search',_search,'plan_code',_plan_code,'sub_status',_sub_status,'suspended_only',_suspended_only,'created_after',_created_after,'created_before',_created_before),
    v_count,
    _source
  );
END;
$$;

-- ============ EXPORT: SUBSCRIPTIONS ============
CREATE OR REPLACE FUNCTION public.platform_admin_export_subscriptions(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _plan_code text DEFAULT NULL,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _source text DEFAULT 'ui'
)
RETURNS TABLE (
  subscription_id uuid,
  workspace_id uuid,
  workspace_name text,
  owner_email text,
  plan_code text,
  plan_name text,
  status text,
  cancel_at_period_end boolean,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      s.id AS subscription_id,
      s.workspace_id,
      w.name AS workspace_name,
      p.email AS owner_email,
      pl.code AS plan_code,
      pl.name AS plan_name,
      s.status::text AS status,
      s.cancel_at_period_end,
      s.trial_ends_at,
      s.current_period_start,
      s.current_period_end,
      s.provider,
      s.created_at,
      s.updated_at
    FROM public.subscriptions s
    JOIN public.workspaces w ON w.id = s.workspace_id
    LEFT JOIN public.profiles p ON p.id = w.owner_id
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
    WHERE
      (_search IS NULL OR w.name ILIKE '%'||_search||'%' OR p.email ILIKE '%'||_search||'%' OR s.id::text = _search OR w.id::text = _search)
      AND (_status IS NULL OR s.status::text = _status)
      AND (_plan_code IS NULL OR pl.code = _plan_code)
      AND (_created_after IS NULL OR s.created_at >= _created_after)
      AND (_created_before IS NULL OR s.created_at <= _created_before)
  )
  SELECT * FROM rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._platform_admin_log_export(
    'subscriptions',
    jsonb_build_object('search',_search,'status',_status,'plan_code',_plan_code,'created_after',_created_after,'created_before',_created_before),
    v_count,
    _source
  );
END;
$$;

-- ============ EXPORT: INVOICES ============
CREATE OR REPLACE FUNCTION public.platform_admin_export_invoices(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _source text DEFAULT 'ui'
)
RETURNS TABLE (
  invoice_id uuid,
  workspace_id uuid,
  workspace_name text,
  plan_code text,
  status text,
  amount_due_cents integer,
  amount_paid_cents integer,
  currency text,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      i.id AS invoice_id,
      i.workspace_id,
      w.name AS workspace_name,
      pl.code AS plan_code,
      i.status::text AS status,
      i.amount_due_cents,
      i.amount_paid_cents,
      i.currency,
      i.due_at,
      i.paid_at,
      i.created_at
    FROM public.invoices i
    JOIN public.workspaces w ON w.id = i.workspace_id
    LEFT JOIN public.subscriptions s ON s.id = i.subscription_id
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
    WHERE
      (_search IS NULL OR w.name ILIKE '%'||_search||'%' OR i.id::text = _search OR w.id::text = _search)
      AND (_status IS NULL OR i.status::text = _status)
      AND (_created_after IS NULL OR i.created_at >= _created_after)
      AND (_created_before IS NULL OR i.created_at <= _created_before)
  )
  SELECT * FROM rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._platform_admin_log_export(
    'invoices',
    jsonb_build_object('search',_search,'status',_status,'created_after',_created_after,'created_before',_created_before),
    v_count,
    _source
  );
END;
$$;

-- ============ EXPORT: DUNNING ============
CREATE OR REPLACE FUNCTION public.platform_admin_export_dunning(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _source text DEFAULT 'ui'
)
RETURNS TABLE (
  case_id uuid,
  workspace_id uuid,
  workspace_name text,
  invoice_id uuid,
  subscription_id uuid,
  status text,
  retry_count integer,
  next_retry_at timestamptz,
  grace_ends_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      d.id AS case_id,
      d.workspace_id,
      w.name AS workspace_name,
      d.invoice_id,
      d.subscription_id,
      d.status,
      d.retry_count,
      d.next_retry_at,
      d.grace_ends_at,
      d.closed_at,
      d.created_at,
      d.updated_at
    FROM public.billing_dunning_cases d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE
      (_search IS NULL OR w.name ILIKE '%'||_search||'%' OR d.id::text = _search OR w.id::text = _search)
      AND (_status IS NULL OR d.status = _status)
      AND (_created_after IS NULL OR d.created_at >= _created_after)
      AND (_created_before IS NULL OR d.created_at <= _created_before)
  )
  SELECT * FROM rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._platform_admin_log_export(
    'dunning',
    jsonb_build_object('search',_search,'status',_status,'created_after',_created_after,'created_before',_created_before),
    v_count,
    _source
  );
END;
$$;

-- ============ EXPORT: ADMIN AUDIT ============
CREATE OR REPLACE FUNCTION public.platform_admin_export_audit(
  _search text DEFAULT NULL,
  _event text DEFAULT NULL,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _source text DEFAULT 'ui'
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  event text,
  admin_user_id uuid,
  email text,
  route text,
  ip text,
  user_agent text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      l.id, l.created_at, l.event, l.admin_user_id, l.email, l.route, l.ip, l.user_agent, l.metadata
    FROM public.platform_admin_actions_log l
    WHERE
      (_search IS NULL OR l.email ILIKE '%'||_search||'%' OR l.event ILIKE '%'||_search||'%' OR l.route ILIKE '%'||_search||'%')
      AND (_event IS NULL OR l.event = _event)
      AND (_created_after IS NULL OR l.created_at >= _created_after)
      AND (_created_before IS NULL OR l.created_at <= _created_before)
    ORDER BY l.created_at DESC
    LIMIT 50000
  )
  SELECT * FROM rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._platform_admin_log_export(
    'audit',
    jsonb_build_object('search',_search,'event',_event,'created_after',_created_after,'created_before',_created_before),
    v_count,
    _source
  );
END;
$$;

-- ============ List exports history ============
CREATE OR REPLACE FUNCTION public.platform_admin_list_exports(
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  dataset text,
  filters jsonb,
  row_count integer,
  source text,
  actor_email text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT l.id, l.dataset, l.filters, l.row_count, l.source, l.actor_email, l.created_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.platform_admin_exports_log l
  ORDER BY l.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;
