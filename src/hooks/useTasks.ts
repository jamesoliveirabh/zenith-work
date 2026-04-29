import {
  useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Assignee, Task, TaskPatch } from "@/types/task";
import { toast } from "sonner";

export const tasksKey = (listId: string) => ["tasks", listId] as const;

interface UseTasksOptions {
  withFieldValues?: boolean;
}

export type TaskWithFieldValues = Task & {
  fieldValues: Record<string, unknown>;
};

const TASK_COLUMNS =
  "id,title,description,description_text,status_id,priority,due_date,start_date,position,created_at,tags,time_estimate_seconds";

async function fetchAssigneesByTask(taskIds: string[]): Promise<Record<string, Assignee[]>> {
  if (taskIds.length === 0) return {};
  const { data: ta, error } = await supabase
    .from("task_assignees")
    .select("task_id,user_id")
    .in("task_id", taskIds);
  if (error) throw error;
  const userIds = Array.from(new Set((ta ?? []).map((r) => r.user_id)));
  let profMap: Record<string, Assignee> = {};
  if (userIds.length > 0) {
    const { data: profs, error: pe } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,email")
      .in("id", userIds);
    if (pe) throw pe;
    profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p as Assignee]));
  }
  const out: Record<string, Assignee[]> = {};
  (ta ?? []).forEach((r) => {
    const p = profMap[r.user_id];
    if (p) (out[r.task_id] ||= []).push(p);
  });
  return out;
}

async function fetchFieldValuesByTask(taskIds: string[]): Promise<Record<string, Record<string, unknown>>> {
  if (taskIds.length === 0) return {};
  const { data, error } = await supabase
    .from("task_field_values")
    .select("task_id,field_id,value")
    .in("task_id", taskIds);
  if (error) throw error;
  const out: Record<string, Record<string, unknown>> = {};
  (data ?? []).forEach((r: { task_id: string; field_id: string; value: unknown }) => {
    (out[r.task_id] ||= {})[r.field_id] = r.value;
  });
  return out;
}

export function useTasks<O extends UseTasksOptions = {}>(
  listId: string | undefined,
  options?: O,
) {
  const withFieldValues = options?.withFieldValues ?? false;
  return useQuery({
    queryKey: [...tasksKey(listId ?? ""), { withFieldValues }],
    enabled: !!listId,
    queryFn: async () => {
      const { data: tk, error } = await supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("list_id", listId!)
        .is("parent_task_id", null)
        .order("position")
        .order("created_at");
      if (error) throw error;
      const baseList = (tk ?? []) as Omit<Task, "assignees">[];
      const ids = baseList.map((t) => t.id);
      const [assigneesByTask, fvByTask] = await Promise.all([
        fetchAssigneesByTask(ids),
        withFieldValues ? fetchFieldValuesByTask(ids) : Promise.resolve({}),
      ]);
      return baseList.map((t) => ({
        ...t,
        assignees: assigneesByTask[t.id] ?? [],
        ...(withFieldValues ? { fieldValues: fvByTask[t.id] ?? {} } : {}),
      })) as O extends { withFieldValues: true } ? TaskWithFieldValues[] : Task[];
    },
  });
}

interface CreateTaskInput {
  workspace_id: string;
  title: string;
  status_id?: string | null;
  priority?: Task["priority"];
  due_date?: string | null;
  start_date?: string | null;
  created_by: string;
  position?: number;
  parent_task_id?: string | null;
}

// Helper: invalidate all variants of tasks key (with or without fieldValues option)
function invalidateTasks(qc: ReturnType<typeof useQueryClient>, listId: string) {
  qc.invalidateQueries({ queryKey: tasksKey(listId) });
}

export function useCreateTask(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<Task> => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ list_id: listId, ...input })
        .select(TASK_COLUMNS)
        .single();
      if (error) throw error;
      return { ...(data as Omit<Task, "assignees">), assignees: [] };
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => invalidateTasks(qc, listId),
  });
}

export function useUpdateTask(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) => {
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: tasksKey(listId) });
      const snapshots: { key: readonly unknown[]; data: unknown }[] = [];
      // Patch every cached variant of ["tasks", listId, ...]
      qc.getQueriesData<Task[]>({ queryKey: tasksKey(listId) }).forEach(([key, data]) => {
        snapshots.push({ key, data });
        if (!data) return;
        qc.setQueryData<Task[]>(
          key,
          data.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        );
      });
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      ctx?.snapshots.forEach(({ key, data }) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, vars) => {
      invalidateTasks(qc, listId);
      qc.invalidateQueries({ queryKey: ["task", vars.id] });
    },
  });
}

export function useDeleteTask(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: tasksKey(listId) });
      const snapshots: { key: readonly unknown[]; data: unknown }[] = [];
      qc.getQueriesData<Task[]>({ queryKey: tasksKey(listId) }).forEach(([key, data]) => {
        snapshots.push({ key, data });
        if (!data) return;
        qc.setQueryData<Task[]>(key, data.filter((t) => t.id !== id));
      });
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      ctx?.snapshots.forEach(({ key, data }) => qc.setQueryData(key, data));
    },
    onSettled: () => invalidateTasks(qc, listId),
  });
}

export function useReorderTasks(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      updates: { id: string; position: number; status_id?: string | null }[],
    ) => {
      const writes = updates.map((u) => {
        const patch: { position: number; status_id?: string | null } = { position: u.position };
        if (u.status_id !== undefined) patch.status_id = u.status_id;
        return supabase.from("tasks").update(patch).eq("id", u.id);
      });
      const results = await Promise.all(writes);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => invalidateTasks(qc, listId),
  });
}

// Assignees on a task in the list-level cache (used by inline AssigneeSelect on rows/cards)
export function useUpdateTaskAssigneesInList(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId, workspaceId, add, remove,
    }: {
      taskId: string;
      workspaceId: string;
      add?: { user: Assignee };
      remove?: { userId: string };
    }) => {
      if (add) {
        const { error } = await supabase.from("task_assignees").insert({
          task_id: taskId, user_id: add.user.id, workspace_id: workspaceId,
        });
        if (error) throw error;
      }
      if (remove) {
        const { error } = await supabase
          .from("task_assignees").delete()
          .eq("task_id", taskId).eq("user_id", remove.userId);
        if (error) throw error;
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: tasksKey(listId) });
      const snapshots: { key: readonly unknown[]; data: unknown }[] = [];
      qc.getQueriesData<Task[]>({ queryKey: tasksKey(listId) }).forEach(([key, data]) => {
        snapshots.push({ key, data });
        if (!data) return;
        qc.setQueryData<Task[]>(
          key,
          data.map((t) => {
            if (t.id !== vars.taskId) return t;
            let next = t.assignees;
            if (vars.add && !next.some((a) => a.id === vars.add!.user.id)) {
              next = [...next, vars.add.user];
            }
            if (vars.remove) {
              next = next.filter((a) => a.id !== vars.remove!.userId);
            }
            return { ...t, assignees: next };
          }),
        );
      });
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      ctx?.snapshots.forEach(({ key, data }) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, vars) => {
      invalidateTasks(qc, listId);
      qc.invalidateQueries({ queryKey: ["task", vars.taskId] });
    },
  });
}
