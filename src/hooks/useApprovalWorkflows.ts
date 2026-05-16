import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ApprovalWorkflow, ApprovalWorkflowStep } from "@/types/approval";

export const approvalWorkflowsKey = (wsId: string) => ["approval-workflows", wsId] as const;
export const approvalWorkflowStepsKey = (wfId: string) => ["approval-workflow-steps", wfId] as const;

export function useApprovalWorkflows(opts: { onlyActive?: boolean } = {}) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: [...approvalWorkflowsKey(current?.id ?? ""), opts.onlyActive ?? true],
    enabled: !!current?.id,
    queryFn: async (): Promise<ApprovalWorkflow[]> => {
      let q = supabase.from("approval_workflows").select("*").eq("workspace_id", current!.id);
      if (opts.onlyActive ?? true) q = q.eq("is_active", true);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalWorkflow[];
    },
  });
}

export function useApprovalWorkflowSteps(workflowId: string | null | undefined) {
  return useQuery({
    queryKey: approvalWorkflowStepsKey(workflowId ?? ""),
    enabled: !!workflowId,
    queryFn: async (): Promise<ApprovalWorkflowStep[]> => {
      const { data, error } = await supabase
        .from("approval_workflow_steps")
        .select("*")
        .eq("workflow_id", workflowId!)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ApprovalWorkflowStep[];
    },
  });
}

export function useCreateApprovalWorkflow() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      entity_type: ApprovalWorkflow["entity_type"];
      description?: string;
      team_id?: string | null;
      trigger_condition?: Record<string, unknown>;
      auto_approve_requester?: boolean;
      expires_after_hours?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("approval_workflows")
        .insert({
          workspace_id: current!.id,
          created_by: user!.id,
          name: input.name.trim(),
          entity_type: input.entity_type,
          description: input.description ?? null,
          team_id: input.team_id ?? null,
          trigger_condition: input.trigger_condition ?? null,
          auto_approve_requester: input.auto_approve_requester ?? false,
          expires_after_hours: input.expires_after_hours ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ApprovalWorkflow;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Workflow criado");
      qc.invalidateQueries({ queryKey: ["approval-workflows"] });
    },
  });
}

export function useUpdateApprovalWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ApprovalWorkflow> }) => {
      const { error } = await supabase.from("approval_workflows").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-workflows"] }),
  });
}

export function useAddWorkflowStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ApprovalWorkflowStep, "id" | "created_at">) => {
      const { error } = await supabase.from("approval_workflow_steps").insert(input);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: approvalWorkflowStepsKey(vars.workflow_id) });
    },
  });
}
