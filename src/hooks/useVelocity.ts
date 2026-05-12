import { useQuery } from "@tanstack/react-query";
import { startOfWeek, subWeeks, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

export interface VelocityPoint {
  weekKey: string;
  label: string;
  startDate: string;
  completed: number;
  average: number;
}

export const velocityKey = (listId: string, weeks: number) => ["velocity", listId, weeks] as const;

/**
 * Tasks completed per ISO week using `tasks.completed_at`.
 */
export function useVelocity(listId: string | undefined, weeks: number = 4) {
  return useQuery({
    queryKey: listId ? velocityKey(listId, weeks) : ["velocity", "_disabled"],
    enabled: !!listId,
    queryFn: async (): Promise<VelocityPoint[]> => {
      const since = subWeeks(new Date(), weeks).toISOString();
      const { data, error } = await supabase
        .from("tasks")
        .select("id, completed_at")
        .eq("list_id", listId!)
        .not("completed_at", "is", null)
        .gte("completed_at", since);
      if (error) throw error;

      const buckets = new Map<string, VelocityPoint>();
      for (let i = weeks - 1; i >= 0; i--) {
        const start = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
        const key = format(start, "yyyy-'W'II");
        buckets.set(key, {
          weekKey: key,
          label: format(start, "dd MMM", { locale: ptBR }),
          startDate: format(start, "yyyy-MM-dd"),
          completed: 0,
          average: 0,
        });
      }

      for (const row of data ?? []) {
        const completedAt = row.completed_at as string | null;
        if (!completedAt) continue;
        const start = startOfWeek(new Date(completedAt), { weekStartsOn: 1 });
        const key = format(start, "yyyy-'W'II");
        const pt = buckets.get(key);
        if (pt) pt.completed += 1;
      }

      const points = Array.from(buckets.values());
      const avg =
        points.length > 0
          ? Math.round((points.reduce((s, p) => s + p.completed, 0) / points.length) * 10) / 10
          : 0;
      return points.map((p) => ({ ...p, average: avg }));
    },
  });
}
