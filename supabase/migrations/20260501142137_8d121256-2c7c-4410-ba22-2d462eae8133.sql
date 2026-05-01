
-- =========================================================
-- P4: Executive Metrics RPCs
-- =========================================================

-- Helper: monthly MRR contribution from a subscription on a given month
-- Active/past_due => price_cents (normalized to monthly); else 0.
CREATE OR REPLACE FUNCTION public._mrr_contribution(_price_cents int, _interval text, _status text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _status NOT IN ('active','past_due') THEN 0
    WHEN _interval = 'year' THEN COALESCE(_price_cents, 0) / 12.0
    ELSE COALESCE(_price_cents, 0)
  END;
$$;

-- ---------------------------------------------------------
-- 1) Summary KPIs with previous-period comparison
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_metrics_summary(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_len interval;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_mrr numeric := 0;
  v_arr numeric := 0;
  v_active_subs int := 0;
  v_paying_start int := 0;
  v_churned int := 0;
  v_churn_rate numeric := 0;
  v_trial_started int := 0;
  v_trial_converted int := 0;
  v_trial_conversion numeric := 0;
  v_dunning_open int := 0;
  v_dunning_recovered int := 0;
  v_recovery_rate numeric := 0;
  v_revenue_cents bigint := 0;
  v_prev_mrr numeric := 0;
  v_prev_revenue_cents bigint := 0;
  v_prev_churned int := 0;
BEGIN
  IF NOT is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_period_len := _to - _from;
  v_prev_from := _from - v_period_len;
  v_prev_to := _from;

  -- Current MRR snapshot (today)
  SELECT COALESCE(SUM(_mrr_contribution(p.price_cents, p.interval, s.status)), 0)
    INTO v_mrr
  FROM workspace_subscriptions s
  LEFT JOIN plans p ON p.id = s.plan_id;

  v_arr := v_mrr * 12;

  SELECT COUNT(*) INTO v_active_subs
  FROM workspace_subscriptions
  WHERE status IN ('active','past_due');

  -- Paying customers at start of current period
  SELECT COUNT(*) INTO v_paying_start
  FROM workspace_subscriptions s
  WHERE s.created_at < _from
    AND (s.canceled_at IS NULL OR s.canceled_at >= _from)
    AND s.status IN ('active','past_due','canceled');

  -- Churned in current period
  SELECT COUNT(*) INTO v_churned
  FROM workspace_subscriptions
  WHERE canceled_at >= _from AND canceled_at < _to;

  v_churn_rate := CASE WHEN v_paying_start > 0 THEN v_churned::numeric / v_paying_start ELSE 0 END;

  -- Trials started in period
  SELECT COUNT(*) INTO v_trial_started
  FROM workspace_subscriptions
  WHERE created_at >= _from AND created_at < _to AND trial_ends_at IS NOT NULL;

  -- Of those, converted to paying (active with current_period_start set)
  SELECT COUNT(*) INTO v_trial_converted
  FROM workspace_subscriptions
  WHERE created_at >= _from AND created_at < _to
    AND trial_ends_at IS NOT NULL
    AND status IN ('active','past_due')
    AND current_period_start IS NOT NULL;

  v_trial_conversion := CASE WHEN v_trial_started > 0 THEN v_trial_converted::numeric / v_trial_started ELSE 0 END;

  -- Dunning recovery
  SELECT
    COUNT(*) FILTER (WHERE created_at >= _from AND created_at < _to),
    COUNT(*) FILTER (WHERE created_at >= _from AND created_at < _to AND status = 'recovered')
    INTO v_dunning_open, v_dunning_recovered
  FROM billing_dunning_cases;

  v_recovery_rate := CASE WHEN v_dunning_open > 0 THEN v_dunning_recovered::numeric / v_dunning_open ELSE 0 END;

  -- Revenue (paid invoices)
  SELECT COALESCE(SUM(amount_paid_cents), 0) INTO v_revenue_cents
  FROM workspace_invoices
  WHERE status = 'paid' AND paid_at >= _from AND paid_at < _to;

  -- Previous-period comparisons
  SELECT COALESCE(SUM(amount_paid_cents), 0) INTO v_prev_revenue_cents
  FROM workspace_invoices
  WHERE status = 'paid' AND paid_at >= v_prev_from AND paid_at < v_prev_to;

  SELECT COUNT(*) INTO v_prev_churned
  FROM workspace_subscriptions
  WHERE canceled_at >= v_prev_from AND canceled_at < v_prev_to;

  -- prev_mrr: approximate as MRR snapshot at _from (sum contributions from subs active at _from)
  SELECT COALESCE(SUM(_mrr_contribution(p.price_cents, p.interval,
    CASE WHEN s.canceled_at IS NULL OR s.canceled_at >= _from THEN 'active' ELSE 'canceled' END)), 0)
    INTO v_prev_mrr
  FROM workspace_subscriptions s
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE s.created_at < _from;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'previous_period', jsonb_build_object('from', v_prev_from, 'to', v_prev_to),
    'mrr_cents', round(v_mrr),
    'arr_cents', round(v_arr),
    'previous_mrr_cents', round(v_prev_mrr),
    'active_subscriptions', v_active_subs,
    'churned_count', v_churned,
    'previous_churned_count', v_prev_churned,
    'churn_rate', round(v_churn_rate::numeric, 4),
    'trial_started', v_trial_started,
    'trial_converted', v_trial_converted,
    'trial_conversion_rate', round(v_trial_conversion::numeric, 4),
    'dunning_total', v_dunning_open,
    'dunning_recovered', v_dunning_recovered,
    'recovery_rate', round(v_recovery_rate::numeric, 4),
    'revenue_cents', v_revenue_cents,
    'previous_revenue_cents', v_prev_revenue_cents
  );
END;
$$;

-- ---------------------------------------------------------
-- 2) Time-series for last 12 months
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_metrics_timeseries(
  _months int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH months AS (
    SELECT date_trunc('month', (now() - (n || ' months')::interval))::timestamptz AS month_start
    FROM generate_series(0, GREATEST(_months, 1) - 1) AS n
  ),
  series AS (
    SELECT
      m.month_start,
      (m.month_start + interval '1 month') AS month_end,
      -- MRR snapshot at end of month
      (
        SELECT COALESCE(SUM(_mrr_contribution(p.price_cents, p.interval,
          CASE WHEN s.canceled_at IS NULL OR s.canceled_at >= (m.month_start + interval '1 month') THEN 'active' ELSE 'canceled' END)), 0)
        FROM workspace_subscriptions s
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.created_at < (m.month_start + interval '1 month')
      ) AS mrr_cents,
      -- New subscriptions
      (SELECT COUNT(*) FROM workspace_subscriptions WHERE created_at >= m.month_start AND created_at < m.month_start + interval '1 month') AS new_subs,
      -- Churned
      (SELECT COUNT(*) FROM workspace_subscriptions WHERE canceled_at >= m.month_start AND canceled_at < m.month_start + interval '1 month') AS churned,
      -- Revenue
      (SELECT COALESCE(SUM(amount_paid_cents), 0) FROM workspace_invoices WHERE status = 'paid' AND paid_at >= m.month_start AND paid_at < m.month_start + interval '1 month') AS revenue_cents
    FROM months m
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', to_char(month_start, 'YYYY-MM'),
    'month_start', month_start,
    'mrr_cents', round(mrr_cents),
    'arr_cents', round(mrr_cents * 12),
    'new_subs', new_subs,
    'churned', churned,
    'revenue_cents', revenue_cents
  ) ORDER BY month_start)
  INTO v_result
  FROM series;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------
-- 3) Cohort retention (logo + revenue) by signup month
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_metrics_cohorts(
  _months int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH bounds AS (
    SELECT date_trunc('month', now() - ((_months - 1) || ' months')::interval)::timestamptz AS first_month,
           date_trunc('month', now())::timestamptz AS current_month
  ),
  cohorts AS (
    SELECT
      date_trunc('month', s.created_at)::timestamptz AS cohort_month,
      s.id AS subscription_id,
      s.created_at,
      s.canceled_at,
      COALESCE(_mrr_contribution(p.price_cents, p.interval, 'active'), 0) AS mrr_cents
    FROM workspace_subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id, bounds b
    WHERE s.created_at >= b.first_month
  ),
  cohort_sizes AS (
    SELECT cohort_month, COUNT(*) AS size, SUM(mrr_cents) AS initial_mrr
    FROM cohorts
    GROUP BY cohort_month
  ),
  retention AS (
    SELECT
      c.cohort_month,
      gs.month_offset,
      COUNT(*) FILTER (
        WHERE c.canceled_at IS NULL
           OR c.canceled_at >= (c.cohort_month + (gs.month_offset || ' months')::interval + interval '1 month')
      ) AS retained_count,
      SUM(CASE
        WHEN c.canceled_at IS NULL
          OR c.canceled_at >= (c.cohort_month + (gs.month_offset || ' months')::interval + interval '1 month')
        THEN c.mrr_cents ELSE 0 END) AS retained_mrr
    FROM cohorts c
    CROSS JOIN LATERAL (
      SELECT generate_series(0,
        LEAST(_months - 1,
          EXTRACT(YEAR FROM age(date_trunc('month', now()), c.cohort_month))::int * 12
          + EXTRACT(MONTH FROM age(date_trunc('month', now()), c.cohort_month))::int
        )) AS month_offset
    ) gs
    GROUP BY c.cohort_month, gs.month_offset
  )
  SELECT jsonb_agg(jsonb_build_object(
    'cohort_month', to_char(cs.cohort_month, 'YYYY-MM'),
    'size', cs.size,
    'initial_mrr_cents', round(cs.initial_mrr),
    'periods', (
      SELECT jsonb_agg(jsonb_build_object(
        'offset', r.month_offset,
        'retained', r.retained_count,
        'retention_rate', CASE WHEN cs.size > 0 THEN round(r.retained_count::numeric / cs.size, 4) ELSE 0 END,
        'retained_mrr_cents', round(r.retained_mrr),
        'mrr_retention_rate', CASE WHEN cs.initial_mrr > 0 THEN round(r.retained_mrr::numeric / cs.initial_mrr, 4) ELSE 0 END
      ) ORDER BY r.month_offset)
      FROM retention r WHERE r.cohort_month = cs.cohort_month
    )
  ) ORDER BY cs.cohort_month)
  INTO v_result
  FROM cohort_sizes cs;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------
-- 4) Conversion funnel (signup → trial → paid → retained)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_admin_metrics_funnel(
  _from timestamptz DEFAULT (now() - interval '90 days'),
  _to timestamptz DEFAULT now(),
  _plan_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signups int := 0;
  v_trials int := 0;
  v_paid int := 0;
  v_retained int := 0;
  v_per_plan jsonb;
BEGIN
  IF NOT is_any_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- signups = workspaces created in period
  SELECT COUNT(*) INTO v_signups
  FROM workspaces
  WHERE created_at >= _from AND created_at < _to;

  WITH base AS (
    SELECT s.*
    FROM workspace_subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.created_at >= _from AND s.created_at < _to
      AND (_plan_code IS NULL OR p.code = _plan_code)
  )
  SELECT
    COUNT(*) FILTER (WHERE trial_ends_at IS NOT NULL),
    COUNT(*) FILTER (WHERE status IN ('active','past_due') AND current_period_start IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'active' AND (canceled_at IS NULL OR canceled_at > now() - interval '30 days'))
  INTO v_trials, v_paid, v_retained
  FROM base;

  -- per-plan breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'plan_code', p.code,
    'plan_name', p.name,
    'trials', COUNT(*) FILTER (WHERE s.trial_ends_at IS NOT NULL),
    'paid', COUNT(*) FILTER (WHERE s.status IN ('active','past_due') AND s.current_period_start IS NOT NULL),
    'retained', COUNT(*) FILTER (WHERE s.status = 'active')
  )), '[]'::jsonb)
  INTO v_per_plan
  FROM workspace_subscriptions s
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE s.created_at >= _from AND s.created_at < _to
    AND (_plan_code IS NULL OR p.code = _plan_code)
  GROUP BY p.code, p.name;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'plan_filter', _plan_code,
    'signups', v_signups,
    'trials', v_trials,
    'paid', v_paid,
    'retained', v_retained,
    'signup_to_trial_rate', CASE WHEN v_signups > 0 THEN round(v_trials::numeric / v_signups, 4) ELSE 0 END,
    'trial_to_paid_rate', CASE WHEN v_trials > 0 THEN round(v_paid::numeric / v_trials, 4) ELSE 0 END,
    'paid_retention_rate', CASE WHEN v_paid > 0 THEN round(v_retained::numeric / v_paid, 4) ELSE 0 END,
    'per_plan', v_per_plan
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_admin_metrics_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_metrics_timeseries(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_metrics_cohorts(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_metrics_funnel(timestamptz, timestamptz, text) TO authenticated;
