import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskMetrics {
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  blockedTasks: number;
  blockedPercentage: number;
  tasksWithSubtasks: number;
  avgSubtasksPerTask: number;
  subtaskCompletionPercentage: number;
  avgDaysToCompletion: number;
  overdueTasks: number;
  tasksWithoutAssignee: number;
}

export const taskMetricsKey = (listId: string) => ["taskMetrics", listId] as const;

export function useTaskMetrics(listId: string | undefined) {
  return useQuery({
    queryKey: listId ? taskMetricsKey(listId) : ["taskMetrics", "_disabled"],
    enabled: !!listId,
    queryFn: async (): Promise<TaskMetrics | null> => {
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, status_id, due_date, created_at, completed_at, assignee_id")
        .eq("list_id", listId!);
      if (error) throw error;

      const taskIds = (tasks ?? []).map((t) => t.id as string);
      const totalTasks = taskIds.length;

      // Done statuses for this list
      const { data: doneStatuses } = await supabase
        .from("status_columns")
        .select("id")
        .eq("list_id", listId!)
        .eq("is_done", true);
      const doneIds = new Set((doneStatuses ?? []).map((s) => s.id as string));

      const completedTasks = (tasks ?? []).filter((t) => doneIds.has(t.status_id as string)).length;

      // Blocked tasks (source has blocked_by → it is blocked by something)
      let blockedTasks = 0;
      if (taskIds.length) {
        const { data: deps } = await supabase
          .from("task_dependencies")
          .select("source_task_id")
          .eq("dependency_type", "blocked_by")
          .in("source_task_id", taskIds);
        blockedTasks = new Set((deps ?? []).map((d) => d.source_task_id as string)).size;
      }

      // Subtasks
      let subtaskRows: { task_id: string; is_completed: boolean }[] = [];
      if (taskIds.length) {
        const { data } = await supabase
          .from("task_subtasks")
          .select("task_id, is_completed")
          .in("task_id", taskIds);
        subtaskRows = (data ?? []) as { task_id: string; is_completed: boolean }[];
      }
      const tasksWithSubtasks = new Set(subtaskRows.map((s) => s.task_id)).size;
      const avgSubtasksPerTask =
        totalTasks > 0 ? Math.round((subtaskRows.length / totalTasks) * 100) / 100 : 0;
      const completedSubtasks = subtaskRows.filter((s) => s.is_completed).length;
      const subtaskCompletionPercentage =
        subtaskRows.length > 0 ? Math.round((completedSubtasks / subtaskRows.length) * 100) : 0;

      // Avg days to completion (completed_at - created_at)
      const completedWithDates = (tasks ?? []).filter(
        (t) => t.completed_at && t.created_at,
      );
      const avgDaysToCompletion =
        completedWithDates.length > 0
          ? Math.round(
              completedWithDates.reduce((sum, t) => {
                const ms =
                  new Date(t.completed_at as string).getTime() -
                  new Date(t.created_at as string).getTime();
                return sum + ms / (1000 * 60 * 60 * 24);
              }, 0) / completedWithDates.length,
            )
          : 0;

      const now = Date.now();
      const overdueTasks = (tasks ?? []).filter(
        (t) =>
          t.due_date &&
          new Date(t.due_date as string).getTime() < now &&
          !doneIds.has(t.status_id as string),
      ).length;

      const tasksWithoutAssignee = (tasks ?? []).filter((t) => !t.assignee_id).length;

      return {
        totalTasks,
        completedTasks,
        completionPercentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        blockedTasks,
        blockedPercentage: totalTasks > 0 ? Math.round((blockedTasks / totalTasks) * 100) : 0,
        tasksWithSubtasks,
        avgSubtasksPerTask,
        subtaskCompletionPercentage,
        avgDaysToCompletion,
        overdueTasks,
        tasksWithoutAssignee,
      };
    },
  });
}
