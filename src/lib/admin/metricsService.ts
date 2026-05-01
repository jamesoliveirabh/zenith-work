import { supabase } from "@/integrations/supabase/client";

export type MetricsSummary = {
  period: { from: string; to: string };
  previous_period: { from: string; to: string };
  mrr_cents: number;
  arr_cents: number;
  previous_mrr_cents: number;
  active_subscriptions: number;
  churned_count: number;
  previous_churned_count: number;
  churn_rate: number;
  trial_started: number;
  trial_converted: number;
  trial_conversion_rate: number;
  dunning_total: number;
  dunning_recovered: number;
  recovery_rate: number;
  revenue_cents: number;
  previous_revenue_cents: number;
};

export type MetricsTimeseriesPoint = {
  month: string;
  month_start: string;
  mrr_cents: number;
  arr_cents: number;
  new_subs: number;
  churned: number;
  revenue_cents: number;
};

export type CohortPeriod = {
  offset: number;
  retained: number;
  retention_rate: number;
  retained_mrr_cents: number;
  mrr_retention_rate: number;
};

export type Cohort = {
  cohort_month: string;
  size: number;
  initial_mrr_cents: number;
  periods: CohortPeriod[] | null;
};

export type FunnelData = {
  period: { from: string; to: string };
  plan_filter: string | null;
  signups: number;
  trials: number;
  paid: number;
  retained: number;
  signup_to_trial_rate: number;
  trial_to_paid_rate: number;
  paid_retention_rate: number;
  per_plan: Array<{
    plan_code: string | null;
    plan_name: string | null;
    trials: number;
    paid: number;
    retained: number;
  }>;
};

export async function fetchMetricsSummary(from: Date, to: Date): Promise<MetricsSummary> {
  const { data, error } = await supabase.rpc("platform_admin_metrics_summary" as any, {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) throw error;
  return data as MetricsSummary;
}

export async function fetchMetricsTimeseries(months = 12): Promise<MetricsTimeseriesPoint[]> {
  const { data, error } = await supabase.rpc("platform_admin_metrics_timeseries" as any, {
    _months: months,
  });
  if (error) throw error;
  return (data as MetricsTimeseriesPoint[]) ?? [];
}

export async function fetchMetricsCohorts(months = 12): Promise<Cohort[]> {
  const { data, error } = await supabase.rpc("platform_admin_metrics_cohorts" as any, {
    _months: months,
  });
  if (error) throw error;
  return (data as Cohort[]) ?? [];
}

export async function fetchMetricsFunnel(
  from: Date,
  to: Date,
  planCode?: string | null,
): Promise<FunnelData> {
  const { data, error } = await supabase.rpc("platform_admin_metrics_funnel" as any, {
    _from: from.toISOString(),
    _to: to.toISOString(),
    _plan_code: planCode ?? null,
  });
  if (error) throw error;
  return data as FunnelData;
}
