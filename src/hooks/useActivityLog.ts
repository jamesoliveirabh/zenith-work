import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityAuthor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ActivityLogEntry {
  id: string;
  task_id: string;
  user_id: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  author?: ActivityAuthor;
}

export const activityLogKey = (taskId: string) => ["activityLog", taskId] as const;

export function useActivityLog(taskId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!taskId) return;
    const ch = supabase
      .channel(`activity-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_activity_logs", filter: `task_id=eq.${taskId}` },
        () => qc.invalidateQueries({ queryKey: activityLogKey(taskId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, qc]);

  return useQuery({
    queryKey: taskId ? activityLogKey(taskId) : ["activityLog", "_disabled"],
    enabled: !!taskId,
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from("task_activity_logs")
        .select("id, task_id, user_id, action, old_value, new_value, created_at")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as ActivityLogEntry[];

      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x)));
      const authors: Record<string, ActivityAuthor> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        for (const p of profs ?? []) {
          authors[p.id as string] = {
            id: p.id as string,
            display_name: (p.display_name as string | null) ?? null,
            avatar_url: (p.avatar_url as string | null) ?? null,
          };
        }
      }
      return rows.map((r) => ({ ...r, author: r.user_id ? authors[r.user_id] : undefined }));
    },
  });
}
