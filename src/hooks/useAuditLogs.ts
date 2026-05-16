import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { AuditLog, AuditLogFilters, TaskAuditEntry } from "@/types/audit";

export const auditLogsKey = (wsId: string, filters: AuditLogFilters) =>
  ["audit-logs", wsId, filters] as const;

export const taskAuditTrailKey = (taskId: string) => ["task-audit-trail", taskId] as const;

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: auditLogsKey(current?.id ?? "", filters),
    enabled: !!current?.id,
    queryFn: async (): Promise<{ logs: AuditLog[]; total: number }> => {
      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;
      let q = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("workspace_id", current!.id);
      if (filters.entityType) q = q.eq("entity_type", filters.entityType);
      if (filters.action) q = q.eq("action", filters.action);
      if (filters.actorId) q = q.eq("actor_id", filters.actorId);
      if (filters.dateRange) {
        q = q.gte("created_at", filters.dateRange.from).lte("created_at", filters.dateRange.to);
      }
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { logs: (data ?? []) as AuditLog[], total: count ?? 0 };
    },
  });
}

export function useTaskAuditTrail(taskId: string | null | undefined) {
  return useQuery({
    queryKey: taskAuditTrailKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskAuditEntry[]> => {
      const { data, error } = await supabase
        .from("task_audit_trail")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TaskAuditEntry[];
    },
  });
}
