import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type {
  ChangeRequest,
  ChangeRequestStatus,
  ChangeType,
  RiskLevel,
} from "@/types/change-request";

export const changeRequestsKey = (
  wsId: string,
  filters: { status?: ChangeRequestStatus; releaseId?: string | null } = {},
) => ["change-requests", wsId, filters] as const;

export function useChangeRequests(filters: {
  status?: ChangeRequestStatus;
  releaseId?: string | null;
} = {}) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: changeRequestsKey(current?.id ?? "", filters),
    enabled: !!current?.id,
    queryFn: async (): Promise<ChangeRequest[]> => {
      let q = supabase.from("change_requests").select("*").eq("workspace_id", current!.id);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.releaseId) q = q.eq("target_release_id", filters.releaseId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChangeRequest[];
    },
  });
}

export function useCreateChangeRequest() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      change_type: ChangeType;
      risk_level: RiskLevel;
      description?: string;
      team_id?: string | null;
      impacted_areas?: string[];
      rollback_plan?: string;
      testing_plan?: string;
      related_entity_type?: string | null;
      related_entity_id?: string | null;
      target_release_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("change_requests")
        .insert({
          workspace_id: current!.id,
          requested_by: user!.id,
          title: input.title.trim(),
          change_type: input.change_type,
          risk_level: input.risk_level,
          description: input.description ?? null,
          team_id: input.team_id ?? null,
          impacted_areas: input.impacted_areas ?? null,
          rollback_plan: input.rollback_plan ?? null,
          testing_plan: input.testing_plan ?? null,
          related_entity_type: input.related_entity_type ?? null,
          related_entity_id: input.related_entity_id ?? null,
          target_release_id: input.target_release_id ?? null,
          status: "draft",
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as ChangeRequest;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Change request criado");
      qc.invalidateQueries({ queryKey: ["change-requests"] });
    },
  });
}

export function useUpdateChangeRequestStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ChangeRequestStatus }) => {
      const patch: Record<string, unknown> = { status };
      const now = new Date().toISOString();
      if (status === "approved") patch.approved_at = now;
      if (status === "implemented") {
        patch.implemented_at = now;
        patch.implemented_by = user?.id ?? null;
      }
      const { error } = await supabase
        .from("change_requests")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["change-requests"] });
    },
  });
}

export function useUpdateChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ChangeRequest> }) => {
      const { error } = await supabase
        .from("change_requests")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["change-requests"] }),
  });
}

export function useDeleteChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("change_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["change-requests"] }),
  });
}
