import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listExportLog, runExport, type ExportDataset, type ExportFilters } from "@/lib/admin/exportsService";

const KEY = ["admin", "exports"] as const;

export function useExportsLog() {
  return useQuery({
    queryKey: [...KEY, "log"],
    queryFn: () => listExportLog(100, 0),
    staleTime: 10_000,
  });
}

export function useRunExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dataset: ExportDataset; filters: ExportFilters }) =>
      runExport(input.dataset, input.filters),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "log"] });
    },
  });
}
