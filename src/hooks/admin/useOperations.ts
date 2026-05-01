import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ops from "@/lib/admin/operationsService";

const KEY = ["admin", "operations"] as const;

export function useAlerts(status?: string) {
  return useQuery({
    queryKey: [...KEY, "alerts", status ?? "all"],
    queryFn: () => ops.listAlerts(status),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
export function useFlags() {
  return useQuery({
    queryKey: [...KEY, "flags"],
    queryFn: () => ops.listFlags(),
    staleTime: 30_000,
  });
}
export function useCheckAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ops.checkAlerts(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "alerts"] }),
  });
}
export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ops.ackAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "alerts"] }),
  });
}
export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; note: string }) => ops.resolveAlert(input.id, input.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "alerts"] }),
  });
}
export function useSetFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; enabled: boolean; reason: string }) =>
      ops.setFlag(input.key, input.enabled, input.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "flags"] }),
  });
}
