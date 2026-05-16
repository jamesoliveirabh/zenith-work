import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type {
  ApprovalDecision,
  ApprovalEntityType,
  ApprovalRequest,
  ApprovalStatus,
} from "@/types/approval";

export const approvalRequestsKey = (
  wsId: string,
  filters: { entityType?: ApprovalEntityType; entityId?: string; status?: ApprovalStatus } = {},
) => ["approval-requests", wsId, filters] as const;

export const approvalDecisionsKey = (requestId: string) =>
  ["approval-decisions", requestId] as const;

export function useApprovalRequests(filters: {
  entityType?: ApprovalEntityType;
  entityId?: string;
  status?: ApprovalStatus;
} = {}) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: approvalRequestsKey(current?.id ?? "", filters),
    enabled: !!current?.id,
    queryFn: async (): Promise<ApprovalRequest[]> => {
      let q = supabase.from("approval_requests").select("*").eq("workspace_id", current!.id);
      if (filters.entityType) q = q.eq("entity_type", filters.entityType);
      if (filters.entityId) q = q.eq("entity_id", filters.entityId);
      if (filters.status) q = q.eq("status", filters.status);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalRequest[];
    },
  });
}

export function useApprovalDecisions(requestId: string | null | undefined) {
  return useQuery({
    queryKey: approvalDecisionsKey(requestId ?? ""),
    enabled: !!requestId,
    queryFn: async (): Promise<ApprovalDecision[]> => {
      const { data, error } = await supabase
        .from("approval_decisions")
        .select("*")
        .eq("request_id", requestId!)
        .order("decided_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ApprovalDecision[];
    },
  });
}

export function useCreateApprovalRequest() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      workflow_id: string;
      entity_type: ApprovalEntityType;
      entity_id: string;
      reason?: string;
      context?: Record<string, unknown>;
      expires_at?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("approval_requests")
        .insert({
          workspace_id: current!.id,
          requested_by: user!.id,
          workflow_id: input.workflow_id,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          reason: input.reason ?? null,
          context: (input.context ?? null) as never,
          expires_at: input.expires_at ?? null,
          current_step_order: 1,
          status: "pending",
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as ApprovalRequest;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Aprovação solicitada");
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
    },
  });
}

/**
 * Record a decision for an approval request. The DB trigger
 * `trg_advance_approval_on_decision` handles status transitions
 * (advance step / approve / reject) and writes the audit entry.
 */
export function useDecideApprovalRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      request: ApprovalRequest;
      step_id: string;
      decision: "approved" | "rejected";
      comment?: string;
    }) => {
      const { error } = await supabase.from("approval_decisions").insert({
        request_id: input.request.id,
        step_id: input.step_id,
        step_order: input.request.current_step_order,
        approver_id: user!.id,
        decision: input.decision,
        comment: input.comment ?? null,
      } as never);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === "approved" ? "Aprovado" : "Rejeitado");
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: approvalDecisionsKey(vars.request.id) });
    },
  });
}

export function useCancelApprovalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("approval_requests")
        .update({ status: "cancelled", completed_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-requests"] }),
  });
}
