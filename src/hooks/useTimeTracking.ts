import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Assignee } from "@/types/task";

export const timeEntriesKey = (taskId: string) => ["time-entries", taskId] as const;
export const activeTimerKey = (userId: string) => ["active-timer", userId] as const;
export const taskTimeTotalsKey = (listId: string) => ["task-time-totals", listId] as const;

export interface TimeEntry {
  id: string;
  task_id: string;
  workspace_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
  user?: Assignee;
}

// ---- Queries ----

export function useTimeEntries(taskId: string | null | undefined) {
  return useQuery({
    queryKey: timeEntriesKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async (): Promise<TimeEntry[]> => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,task_id,workspace_id,user_id,started_at,ended_at,duration_seconds,note,created_at")
        .eq("task_id", taskId!)
        .order("started_at", { ascending: false });
      if (error) throw error;
      const entries = (data ?? []) as TimeEntry[];
      const userIds = Array.from(new Set(entries.map((e) => e.user_id)));
      if (userIds.length === 0) return entries;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,email")
        .in("id", userIds);
      const map = Object.fromEntries((profs ?? []).map((p) => [p.id, p as Assignee]));
      return entries.map((e) => ({ ...e, user: map[e.user_id] }));
    },
  });
}

export function useActiveTimer(userId: string | null | undefined) {
  return useQuery({
    queryKey: activeTimerKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async (): Promise<TimeEntry | null> => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,task_id,workspace_id,user_id,started_at,ended_at,duration_seconds,note,created_at")
        .eq("user_id", userId!)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as TimeEntry | null) ?? null;
    },
  });
}

/** Aggregated total seconds per task in a list. Used by ListView/TableView columns. */
export function useTaskTimeTotals(listId: string | null | undefined) {
  return useQuery({
    queryKey: taskTimeTotalsKey(listId ?? ""),
    enabled: !!listId,
    queryFn: async (): Promise<Record<string, number>> => {
      // Fetch task ids in this list, then sum time_entries for those tasks.
      const { data: tk, error: te } = await supabase
        .from("tasks")
        .select("id")
        .eq("list_id", listId!)
        .is("parent_task_id", null);
      if (te) throw te;
      const ids = (tk ?? []).map((r) => r.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("time_entries")
        .select("task_id,duration_seconds,started_at,ended_at")
        .in("task_id", ids);
      if (error) throw error;
      const totals: Record<string, number> = {};
      const now = Date.now();
      (data ?? []).forEach((e) => {
        const dur =
          e.duration_seconds ??
          (e.ended_at
            ? Math.floor((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000)
            : Math.floor((now - new Date(e.started_at).getTime()) / 1000));
        totals[e.task_id] = (totals[e.task_id] ?? 0) + Math.max(0, dur);
      });
      return totals;
    },
  });
}

// ---- Mutations ----

function invalidateForTask(qc: ReturnType<typeof useQueryClient>, taskId: string, userId?: string) {
  qc.invalidateQueries({ queryKey: timeEntriesKey(taskId) });
  if (userId) qc.invalidateQueries({ queryKey: activeTimerKey(userId) });
  qc.invalidateQueries({ queryKey: ["task-time-totals"] });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; workspaceId: string; userId: string }) => {
      // Stop any existing active timer for this user first.
      const { data: existing } = await supabase
        .from("time_entries")
        .select("id,started_at")
        .eq("user_id", input.userId)
        .is("ended_at", null);
      const now = new Date();
      if (existing && existing.length > 0) {
        await Promise.all(
          existing.map((row) => {
            const dur = Math.max(
              0,
              Math.floor((now.getTime() - new Date(row.started_at).getTime()) / 1000),
            );
            return supabase
              .from("time_entries")
              .update({ ended_at: now.toISOString(), duration_seconds: dur })
              .eq("id", row.id);
          }),
        );
      }
      const { data, error } = await supabase
        .from("time_entries")
        .insert({
          task_id: input.taskId,
          workspace_id: input.workspaceId,
          user_id: input.userId,
          started_at: now.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as TimeEntry;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => invalidateForTask(qc, vars.taskId, vars.userId),
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entryId: string; startedAt: string; taskId: string; userId: string }) => {
      const now = new Date();
      const dur = Math.max(
        0,
        Math.floor((now.getTime() - new Date(input.startedAt).getTime()) / 1000),
      );
      const { error } = await supabase
        .from("time_entries")
        .update({ ended_at: now.toISOString(), duration_seconds: dur })
        .eq("id", input.entryId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => invalidateForTask(qc, vars.taskId, vars.userId),
  });
}

export function useAddManualEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      workspaceId: string;
      userId: string;
      durationSeconds: number;
      date: Date;
      note?: string | null;
    }) => {
      const started = input.date;
      const ended = new Date(started.getTime() + input.durationSeconds * 1000);
      const { error } = await supabase.from("time_entries").insert({
        task_id: input.taskId,
        workspace_id: input.workspaceId,
        user_id: input.userId,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        duration_seconds: input.durationSeconds,
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => invalidateForTask(qc, vars.taskId, vars.userId),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entryId: string; taskId: string; userId: string }) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", input.entryId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => invalidateForTask(qc, vars.taskId, vars.userId),
  });
}

// ---- Utils ----

/** Parse "1h 30m", "90m", "2h", "45" (assumed minutes) into seconds. Returns null if invalid. */
export function parseDurationInput(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // Pattern with h and/or m
  const re = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/;
  const m = s.match(re);
  if (m && (m[1] || m[2])) {
    const h = parseInt(m[1] ?? "0", 10);
    const min = parseInt(m[2] ?? "0", 10);
    return h * 3600 + min * 60;
  }
  // Bare number => minutes
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60;
  return null;
}

export function formatDuration(totalSeconds: number, opts?: { withSeconds?: boolean }): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (opts?.withSeconds) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (h === 0 && m === 0) return `0m`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
