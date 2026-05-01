import { useQuery } from "@tanstack/react-query";
import {
  fetchMetricsCohorts,
  fetchMetricsFunnel,
  fetchMetricsSummary,
  fetchMetricsTimeseries,
} from "@/lib/admin/metricsService";

export function useMetricsSummary(from: Date, to: Date) {
  return useQuery({
    queryKey: ["admin", "metrics", "summary", from.toISOString(), to.toISOString()],
    queryFn: () => fetchMetricsSummary(from, to),
  });
}

export function useMetricsTimeseries(months = 12) {
  return useQuery({
    queryKey: ["admin", "metrics", "timeseries", months],
    queryFn: () => fetchMetricsTimeseries(months),
  });
}

export function useMetricsCohorts(months = 12) {
  return useQuery({
    queryKey: ["admin", "metrics", "cohorts", months],
    queryFn: () => fetchMetricsCohorts(months),
  });
}

export function useMetricsFunnel(from: Date, to: Date, planCode?: string | null) {
  return useQuery({
    queryKey: ["admin", "metrics", "funnel", from.toISOString(), to.toISOString(), planCode ?? ""],
    queryFn: () => fetchMetricsFunnel(from, to, planCode),
  });
}
