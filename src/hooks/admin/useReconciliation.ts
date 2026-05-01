import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  applyReconciliationFix,
  fetchReconciliationHistory,
  runReconciliationScan,
} from "@/lib/admin/reconciliationService";

export function useReconciliationScan() {
  return useQuery({
    queryKey: ["admin", "reconciliation", "scan"],
    queryFn: runReconciliationScan,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

export function useReconciliationHistory(kind?: "scan" | "fix") {
  return useQuery({
    queryKey: ["admin", "reconciliation", "history", kind ?? "all"],
    queryFn: () => fetchReconciliationHistory(kind, 100),
  });
}

export function useApplyReconciliationFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: applyReconciliationFix,
    onSuccess: (res) => {
      toast.success(`Correção aplicada: ${res.action}`);
      qc.invalidateQueries({ queryKey: ["admin", "reconciliation"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Falha ao aplicar correção");
    },
  });
}
