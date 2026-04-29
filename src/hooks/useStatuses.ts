import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Status } from "@/types/task";
import { toast } from "sonner";

export const statusesKey = (listId: string) => ["statuses", listId] as const;

export function useStatuses(listId: string | undefined) {
  return useQuery({
    queryKey: statusesKey(listId ?? ""),
    enabled: !!listId,
    queryFn: async (): Promise<Status[]> => {
      const { data, error } = await supabase
        .from("status_columns")
        .select("id,name,color,is_done,position")
        .eq("list_id", listId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Status[];
    },
  });
}

interface CreateStatusInput {
  workspace_id: string;
  name: string;
  color?: string | null;
  is_done?: boolean;
  position?: number;
}

export function useCreateStatus(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStatusInput) => {
      const { data, error } = await supabase
        .from("status_columns")
        .insert({ list_id: listId, ...input })
        .select("id,name,color,is_done,position")
        .single();
      if (error) throw error;
      return data as Status;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: statusesKey(listId) }),
  });
}

export function useUpdateStatus(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<Status, "id">> }) => {
      const { error } = await supabase.from("status_columns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: statusesKey(listId) }),
  });
}

export function useDeleteStatus(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("status_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: statusesKey(listId) }),
  });
}

export function useReorderStatuses(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; position: number }[]) => {
      const writes = updates.map((u) =>
        supabase.from("status_columns").update({ position: u.position }).eq("id", u.id)
      );
      const results = await Promise.all(writes);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: statusesKey(listId) }),
  });
}
