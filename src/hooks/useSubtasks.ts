import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SubtaskRow {
  id: string;
  task_id: string;
  parent_subtask_id: string | null;
  title: string;
  description: string | null;
  is_completed: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface SubtaskNode extends SubtaskRow {
  children: SubtaskNode[];
}

export const subtasksKey = (taskId: string) => ["subtasks", taskId] as const;
export const subtaskProgressKey = (taskId: string) =>
  ["subtasks", taskId, "progress"] as const;

function buildTree(rows: SubtaskRow[]): SubtaskNode[] {
  const map = new Map<string, SubtaskNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: SubtaskNode[] = [];
  const sorted = [...rows].sort((a, b) => a.order_index - b.order_index);
  sorted.forEach((r) => {
    const node = map.get(r.id)!;
    if (r.parent_subtask_id && map.has(r.parent_subtask_id)) {
      map.get(r.parent_subtask_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function computeProgress(rows: SubtaskRow[]): number {
  if (rows.length === 0) return 0;
  const done = rows.filter((r) => r.is_completed).length;
  return Math.round((done / rows.length) * 100);
}

export function useSubtasks(taskId: string | undefined) {
  return useQuery({
    queryKey: subtasksKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("*")
        .eq("task_id", taskId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as SubtaskRow[];
      return {
        rows,
        tree: buildTree(rows),
        progress: computeProgress(rows),
        total: rows.length,
        completed: rows.filter((r) => r.is_completed).length,
      };
    },
  });
}

export function useProgressPercentage(taskId: string | undefined) {
  return useQuery({
    queryKey: subtaskProgressKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("is_completed")
        .eq("task_id", taskId!);
      if (error) throw error;
      const rows = (data ?? []) as { is_completed: boolean }[];
      const total = rows.length;
      const completed = rows.filter((r) => r.is_completed).length;
      return {
        total,
        completed,
        percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
      };
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, taskId: string) {
  qc.invalidateQueries({ queryKey: subtasksKey(taskId) });
  qc.invalidateQueries({ queryKey: subtaskProgressKey(taskId) });
  qc.invalidateQueries({ queryKey: ["task", taskId] });
  qc.invalidateQueries({ queryKey: ["tasks"] });
}

export function useCreateSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string | null;
      parentSubtaskId?: string | null;
    }) => {
      const { data: existing, error: ce } = await supabase
        .from("task_subtasks")
        .select("order_index")
        .eq("task_id", taskId)
        .order("order_index", { ascending: false })
        .limit(1);
      if (ce) throw ce;
      const nextIndex = (existing?.[0]?.order_index ?? -1) + 1;

      const { data: userRes } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("task_subtasks")
        .insert({
          task_id: taskId,
          title: input.title,
          description: input.description ?? null,
          parent_subtask_id: input.parentSubtaskId ?? null,
          order_index: nextIndex,
          created_by: userRes.user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as SubtaskRow;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => invalidateAll(qc, taskId),
  });
}

export function useUpdateSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subtaskId,
      patch,
    }: {
      subtaskId: string;
      patch: { title?: string; description?: string | null; is_completed?: boolean };
    }) => {
      const update: {
        title?: string;
        description?: string | null;
        is_completed?: boolean;
        completed_at?: string | null;
      } = { ...patch };
      if (patch.is_completed !== undefined) {
        update.completed_at = patch.is_completed ? new Date().toISOString() : null;
      }
      const { error } = await supabase
        .from("task_subtasks")
        .update(update as never)
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => invalidateAll(qc, taskId),
  });
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subtaskId: string) => {
      const { error } = await supabase
        .from("task_subtasks")
        .delete()
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => invalidateAll(qc, taskId),
  });
}

export function useReorderSubtasks(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reordered: { id: string; order_index: number }[];
    }) => {
      const writes = input.reordered.map((r) =>
        supabase
          .from("task_subtasks")
          .update({ order_index: r.order_index })
          .eq("id", r.id),
      );
      const results = await Promise.all(writes);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => invalidateAll(qc, taskId),
  });
}
