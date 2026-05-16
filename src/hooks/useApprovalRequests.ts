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
 * Record a decision for an approval request via the atomic RPC
 * `decide_approval_request`. The RPC locks the request (SELECT FOR UPDATE),
 * validates state (status=pending, correct step, no duplicate by same
 * approver), inserts the decision, and the AFTER INSERT trigger advances
 * the step / finalizes the request and writes the audit log — all in one
 * transaction.
 *
 * Returns: { success, status, current_step_order, completed }.
 */
export interface DecideApprovalResult {
  success: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  current_step_order: number;
  completed: boolean;
}

export function useDecideApprovalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      stepOrder: number;
      decision: "approved" | "rejected";
      comment?: string;
    }): Promise<DecideApprovalResult> => {
      const { data, error } = await supabase.rpc("decide_approval_request" as never, {
        p_request_id: input.requestId,
        p_step_order: input.stepOrder,
        p_decision: input.decision,
        p_comment: input.comment ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as DecideApprovalResult;
    },
    onError: (e: Error) => {
      const msg = e.message ?? "";
      if (msg.includes("already decided")) {
        toast.error("Você já decidiu este passo.");
      } else if (msg.includes("Wrong step")) {
        toast.error("Outro aprovador já avançou esta solicitação. Recarregue.");
      } else if (msg.includes("not pending")) {
        toast.error("Esta solicitação já foi finalizada.");
      } else if (msg.includes("not found")) {
        toast.error("Solicitação não encontrada.");
      } else {
        toast.error(msg || "Falha ao registrar decisão.");
      }
    },
    onSuccess: (result, vars) => {
      toast.success(
        result.completed
          ? vars.decision === "approved"
            ? "Aprovação concluída"
            : "Solicitação rejeitada"
          : "Passo aprovado — avançando para o próximo",
      );
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: approvalDecisionsKey(vars.requestId) });
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
