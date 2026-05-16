import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Release, ReleaseItem, ReleaseItemType, ReleaseStatus } from "@/types/release";

export const releasesKey = (wsId: string, status?: ReleaseStatus) =>
  ["releases", wsId, status ?? "all"] as const;

export const releaseItemsKey = (releaseId: string) => ["release-items", releaseId] as const;

export function useReleases(filters: { status?: ReleaseStatus; sprintId?: string } = {}) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: [...releasesKey(current?.id ?? "", filters.status), filters.sprintId ?? "all"],
    enabled: !!current?.id,
    queryFn: async (): Promise<Release[]> => {
      let q = supabase.from("releases").select("*").eq("workspace_id", current!.id);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.sprintId) q = q.eq("sprint_id", filters.sprintId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Release[];
    },
  });
}

export function useCreateRelease() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      version: string;
      description?: string;
      team_id?: string | null;
      sprint_id?: string | null;
      target_date?: string | null;
      release_notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("releases")
        .insert({
          workspace_id: current!.id,
          created_by: user!.id,
          name: input.name.trim(),
          version: input.version.trim(),
          description: input.description ?? null,
          team_id: input.team_id ?? null,
          sprint_id: input.sprint_id ?? null,
          target_date: input.target_date ?? null,
          release_notes: input.release_notes ?? null,
          status: "planning",
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as Release;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Release criada");
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}

export function useUpdateReleaseStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      rollback_reason,
    }: {
      id: string;
      status: ReleaseStatus;
      rollback_reason?: string;
    }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status };
      if (status === "released") {
        patch.released_at = now;
        patch.deployed_by = user?.id ?? null;
      }
      if (status === "rolled_back") {
        patch.rolled_back_at = now;
        patch.rolled_back_by = user?.id ?? null;
        patch.rollback_reason = rollback_reason ?? null;
      }
      const { error } = await supabase.from("releases").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Status da release atualizado");
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}

export function useUpdateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Release> }) => {
      const { error } = await supabase.from("releases").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["releases"] }),
  });
}

export function useDeleteRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("releases").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["releases"] }),
  });
}

// ---------- Release Items ----------

export function useReleaseItems(releaseId: string | null | undefined) {
  return useQuery({
    queryKey: releaseItemsKey(releaseId ?? ""),
    enabled: !!releaseId,
    queryFn: async (): Promise<ReleaseItem[]> => {
      const { data, error } = await supabase
        .from("release_items")
        .select("*")
        .eq("release_id", releaseId!)
        .order("added_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReleaseItem[];
    },
  });
}

export function useAddReleaseItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      release_id: string;
      item_type: ReleaseItemType;
      item_id: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("release_items").insert({
        release_id: input.release_id,
        item_type: input.item_type,
        item_id: input.item_id,
        notes: input.notes ?? null,
        added_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: releaseItemsKey(vars.release_id) });
    },
  });
}

export function useRemoveReleaseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; releaseId: string }) => {
      const { error } = await supabase.from("release_items").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: releaseItemsKey(vars.releaseId) });
    },
  });
}
