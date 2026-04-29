import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Assignee } from "@/types/task";
import { toast } from "sonner";

export const taskDetailKey = (taskId: string) => ["task", taskId] as const;

export interface Subtask {
  id: string;
  title: string;
  completed_at: string | null;
  position: number;
}

export interface TaskComment {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
}

export interface TaskDetail {
  id: string;
  title: string;
  description: unknown | null;
  tags: string[];
  time_estimate_seconds: number | null;
  subtasks: Subtask[];
  comments: TaskComment[];
  assignees: Assignee[];
  // profile lookup for comment authors (and assignees)
  profiles: Record<string, Assignee>;
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: taskDetailKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskDetail> => {
      const id = taskId!;
      const [{ data: task, error: te }, { data: subs, error: se }, { data: cmts, error: ce }, { data: ta, error: ae }] =
        await Promise.all([
          supabase.from("tasks").select("id,title,description,tags,time_estimate_seconds").eq("id", id).maybeSingle(),
          supabase.from("tasks").select("id,title,completed_at,position")
            .eq("parent_task_id", id).order("position").order("created_at"),
          supabase.from("task_comments").select("id,body,author_id,created_at")
            .eq("task_id", id).order("created_at"),
          supabase.from("task_assignees").select("user_id").eq("task_id", id),
        ]);
      if (te || se || ce || ae) throw (te || se || ce || ae)!;

      const assigneeIds = (ta ?? []).map((r) => r.user_id);
      const authorIds = Array.from(new Set((cmts ?? []).map((c) => c.author_id)));
      const allIds = Array.from(new Set([...assigneeIds, ...authorIds]));
      let profiles: Record<string, Assignee> = {};
      if (allIds.length > 0) {
        const { data: profs, error: pe } = await supabase
          .from("profiles").select("id,display_name,avatar_url,email").in("id", allIds);
        if (pe) throw pe;
        profiles = Object.fromEntries((profs ?? []).map((p) => [p.id, p as Assignee]));
      }

      return {
        id,
        title: task?.title ?? "",
        description: task?.description ?? null,
        tags: (task?.tags ?? []) as string[],
        time_estimate_seconds: (task?.time_estimate_seconds ?? null) as number | null,
        subtasks: (subs ?? []) as Subtask[],
        comments: (cmts ?? []) as TaskComment[],
        assignees: assigneeIds.map((uid) => profiles[uid]).filter(Boolean),
        profiles,
      };
    },
  });
}

// ---------- Subtasks ----------

export function useCreateSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      list_id: string;
      workspace_id: string;
      created_by: string;
      position: number;
    }) => {
      const { error } = await supabase.from("tasks").insert({
        ...input,
        parent_task_id: taskId,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: taskDetailKey(taskId) });
      const prev = qc.getQueryData<TaskDetail>(taskDetailKey(taskId));
      if (prev) {
        const optimistic: Subtask = {
          id: `tmp-${Date.now()}`,
          title: input.title,
          completed_at: null,
          position: input.position,
        };
        qc.setQueryData<TaskDetail>(taskDetailKey(taskId), {
          ...prev,
          subtasks: [...prev.subtasks, optimistic],
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(taskDetailKey(taskId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }),
  });
}

export function useToggleSubtask(taskId: string, doneStatusId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subtask }: { subtask: Subtask }) => {
      const completed = !subtask.completed_at;
      const patch: { completed_at: string | null; status_id?: string } = {
        completed_at: completed ? new Date().toISOString() : null,
      };
      if (completed && doneStatusId) patch.status_id = doneStatusId;
      const { error } = await supabase.from("tasks").update(patch).eq("id", subtask.id);
      if (error) throw error;
    },
    onMutate: async ({ subtask }) => {
      await qc.cancelQueries({ queryKey: taskDetailKey(taskId) });
      const prev = qc.getQueryData<TaskDetail>(taskDetailKey(taskId));
      if (prev) {
        const completed = !subtask.completed_at;
        qc.setQueryData<TaskDetail>(taskDetailKey(taskId), {
          ...prev,
          subtasks: prev.subtasks.map((s) =>
            s.id === subtask.id
              ? { ...s, completed_at: completed ? new Date().toISOString() : null }
              : s,
          ),
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(taskDetailKey(taskId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }),
  });
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskDetailKey(taskId) });
      const prev = qc.getQueryData<TaskDetail>(taskDetailKey(taskId));
      if (prev) {
        qc.setQueryData<TaskDetail>(taskDetailKey(taskId), {
          ...prev, subtasks: prev.subtasks.filter((s) => s.id !== id),
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(taskDetailKey(taskId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }),
  });
}

// ---------- Comments ----------

export function useCreateComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; workspace_id: string; author_id: string }) => {
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId, ...input,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }),
  });
}

// ---------- Assignees ----------

export function useUpdateTaskAssignees(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId, add, remove,
    }: {
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
        const { error } = await supabase.from("task_assignees").delete()
          .eq("task_id", taskId).eq("user_id", remove.userId);
        if (error) throw error;
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: taskDetailKey(taskId) });
      const prev = qc.getQueryData<TaskDetail>(taskDetailKey(taskId));
      if (prev) {
        let next = prev.assignees;
        if (vars.add && !next.some((a) => a.id === vars.add!.user.id)) next = [...next, vars.add.user];
        if (vars.remove) next = next.filter((a) => a.id !== vars.remove!.userId);
        qc.setQueryData<TaskDetail>(taskDetailKey(taskId), { ...prev, assignees: next });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(taskDetailKey(taskId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskDetailKey(taskId) });
      // Also refresh any list cache that may show this task's assignees
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// ---------- Meta (title / description / tags) ----------

export interface TaskMetaPatch {
  title?: string;
  description?: unknown | null;
  tags?: string[];
}

export function useUpdateTaskMeta(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TaskMetaPatch) => {
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", taskId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: taskDetailKey(taskId) });
      const prev = qc.getQueryData<TaskDetail>(taskDetailKey(taskId));
      if (prev) {
        qc.setQueryData<TaskDetail>(taskDetailKey(taskId), {
          ...prev,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(taskDetailKey(taskId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskDetailKey(taskId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
