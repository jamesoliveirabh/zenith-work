-- ================================================================
-- Phase P2 — Global financial listings (platform-admin only)
-- ================================================================

CREATE OR REPLACE FUNCTION public.platform_admin_list_subscriptions(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _plan_code text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
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
  current_period_end timestamptz,
  provider text,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS subscription_id,
      w.id AS workspace_id,
      w.name AS workspace_name,
      p_owner.email AS owner_email,
      pl.code AS plan_code,
      pl.name AS plan_name,
      s.status,
      s.cancel_at_period_end,
      s.trial_ends_at,
      s.current_period_end,
      s.billing_provider AS provider,
      s.updated_at
    FROM public.workspace_subscriptions s
    JOIN public.workspaces w ON w.id = s.workspace_id
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
    LEFT JOIN public.workspace_members wm
      ON wm.workspace_id = w.id AND wm.role = 'admin'
    LEFT JOIN public.profiles p_owner ON p_owner.id = wm.user_id
    WHERE
      (_status IS NULL OR s.status = _status)
      AND (_plan_code IS NULL OR pl.code = _plan_code)
      AND (
        _search IS NULL OR _search = ''
        OR w.name ILIKE '%' || _search || '%'
        OR p_owner.email ILIKE '%' || _search || '%'
        OR w.id::text = _search
        OR s.id::text = _search
      )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.*, c.c FROM base b CROSS JOIN counted c
  ORDER BY b.updated_at DESC NULLS LAST
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_list_invoices(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _created_after timestamptz DEFAULT NULL,
  _created_before timestamptz DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
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
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      i.id AS invoice_id,
      w.id AS workspace_id,
      w.name AS workspace_name,
      pl.code AS plan_code,
      i.status,
      i.amount_due_cents,
      i.amount_paid_cents,
      i.currency,
      i.due_at,
      i.paid_at,
      i.created_at
    FROM public.workspace_invoices i
    JOIN public.workspaces w ON w.id = i.workspace_id
    LEFT JOIN public.workspace_subscriptions s ON s.id = i.subscription_id
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
    WHERE
      (_status IS NULL OR i.status = _status)
      AND (_created_after IS NULL OR i.created_at >= _created_after)
      AND (_created_before IS NULL OR i.created_at <= _created_before)
      AND (
        _search IS NULL OR _search = ''
        OR w.name ILIKE '%' || _search || '%'
        OR i.id::text = _search
        OR w.id::text = _search
      )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.*, c.c FROM base b CROSS JOIN counted c
  ORDER BY b.created_at DESC
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_list_dunning(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
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
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      dc.id AS case_id,
      w.id AS workspace_id,
      w.name AS workspace_name,
      dc.invoice_id,
      dc.subscription_id,
      dc.status,
      dc.retry_count,
      dc.next_retry_at,
      dc.grace_ends_at,
      dc.created_at,
      dc.updated_at
    FROM public.billing_dunning_cases dc
    JOIN public.workspaces w ON w.id = dc.workspace_id
    WHERE
      (_status IS NULL OR dc.status = _status)
      AND (
        _search IS NULL OR _search = ''
        OR w.name ILIKE '%' || _search || '%'
        OR w.id::text = _search
        OR dc.id::text = _search
      )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.*, c.c FROM base b CROSS JOIN counted c
  ORDER BY b.updated_at DESC
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_list_subscriptions(text,text,text,integer,integer) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_list_invoices(text,text,timestamptz,timestamptz,integer,integer) FROM anon;
REVOKE ALL ON FUNCTION public.platform_admin_list_dunning(text,text,integer,integer) FROM anon;