import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GanttTask {
  id: string;
  list_id: string;
  workspace_id: string;
  parent_task_id: string | null;
  title: string;
  status_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  position: number;
}

export interface TaskRelation {
  id: string;
  source_task_id: string;
  target_task_id: string;
  relation_type: "blocks" | "relates_to" | "duplicates";
}

export function useGanttTasks(listId: string | undefined) {
  return useQuery({
    queryKey: ["gantt-tasks", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,list_id,workspace_id,parent_task_id,title,status_id,priority,assignee_id,start_date,due_date,position")
        .eq("list_id", listId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as GanttTask[];
    },
  });
}

export function useTaskRelations(workspaceId: string | undefined, taskIds: string[]) {
  return useQuery({
    queryKey: ["task-relations", workspaceId, taskIds.sort().join(",")],
    enabled: !!workspaceId && taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_relations")
        .select("id,source_task_id,target_task_id,relation_type")
        .eq("workspace_id", workspaceId!)
        .or(`source_task_id.in.(${taskIds.join(",")}),target_task_id.in.(${taskIds.join(",")})`);
      if (error) throw error;
      return (data ?? []) as TaskRelation[];
    },
  });
}

export function useUpdateTaskDates(listId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, start_date, due_date }: {
      id: string; start_date?: string | null; due_date?: string | null;
    }) => {
      const patch: Record<string, any> = {};
      if (start_date !== undefined) patch.start_date = start_date;
      if (due_date !== undefined) patch.due_date = due_date;
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, start_date, due_date }) => {
      await qc.cancelQueries({ queryKey: ["gantt-tasks", listId] });
      const prev = qc.getQueryData<GanttTask[]>(["gantt-tasks", listId]);
      if (prev) {
        qc.setQueryData<GanttTask[]>(["gantt-tasks", listId], prev.map((t) =>
          t.id === id
            ? {
                ...t,
                start_date: start_date !== undefined ? start_date : t.start_date,
                due_date: due_date !== undefined ? due_date : t.due_date,
              }
            : t,
        ));
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["gantt-tasks", listId], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["gantt-tasks", listId] });
      qc.invalidateQueries({ queryKey: ["tasks", listId] });
    },
  });
}

export function useCreateGanttTask(listId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, start_date, due_date, status_id }: {
      title: string; start_date?: string | null; due_date?: string | null; status_id: string | null;
    }) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          list_id: listId!,
          workspace_id: workspaceId!,
          title,
          start_date,
          due_date,
          status_id,
          priority: "medium",
          position: Date.now(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gantt-tasks", listId] });
      qc.invalidateQueries({ queryKey: ["tasks", listId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
