import { useQuery } from "@tanstack/react-query";
import { startOfDay, subDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface BurndownPoint {
  date: string;
  label: string;
  completed: number;
  total: number;
  remaining: number;
  ideal: number;
}

export const burndownKey = (listId: string, days: number) => ["burndown", listId, days] as const;

/**
 * Computes a daily burndown for a list (project equivalent) using `tasks.completed_at`.
 */
export function useBurndown(listId: string | undefined, days: number = 14) {
  return useQuery({
    queryKey: listId ? burndownKey(listId, days) : ["burndown", "_disabled"],
    enabled: !!listId,
    queryFn: async (): Promise<BurndownPoint[]> => {
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, completed_at, created_at")
        .eq("list_id", listId!);
      if (error) throw error;

      const total = tasks?.length ?? 0;
      const today = startOfDay(new Date());
      const points: BurndownPoint[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const day = subDays(today, i);
        const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
        const completed =
          tasks?.filter(
            (t) => t.completed_at && new Date(t.completed_at as string) <= dayEnd,
          ).length ?? 0;
        const idealCompleted = total > 0 ? Math.round((total * (days - 1 - i)) / (days - 1 || 1)) : 0;
        points.push({
          date: format(day, "yyyy-MM-dd"),
          label: format(day, "dd/MM"),
          completed,
          total,
          remaining: total - completed,
          ideal: total - idealCompleted,
        });
      }
      return points;
    },
  });
}
