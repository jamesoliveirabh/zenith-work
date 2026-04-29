import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

// ===== Types =====

export type Priority = "low" | "medium" | "high" | "urgent";

export interface DashboardTask {
  id: string;
  title: string;
  list_id: string;
  status_id: string | null;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  // joined
  list_name: string | null;
  space_name: string | null;
  status_name: string | null;
  status_color: string | null;
  status_is_done: boolean;
}

export interface MyTasksGrouped {
  overdue: DashboardTask[];
  today: DashboardTask[];
  thisWeek: DashboardTask[];
  future: DashboardTask[];
  all: DashboardTask[];
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  actor_id: string;
  action:
    | "task_created" | "task_updated" | "task_deleted" | "task_completed"
    | "task_assigned" | "comment_created" | "attachment_added"
    | "list_created" | "space_created" | "member_joined";
  entity_type: string;
  entity_id: string;
  entity_title: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

export interface SpaceProgress {
  space_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  total: number;
  completed: number;
}

export interface PriorityBucket {
  priority: Priority;
  count: number;
}

export interface WeeklyActivityPoint {
  date: string; // ISO yyyy-MM-dd
  created: number;
  completed: number;
}

export interface DashboardWidgetConfig {
  id: string;
  user_id: string;
  workspace_id: string;
  widget_type: string;
  position: number;
  config: Record<string, unknown>;
  is_visible: boolean;
}

// ===== Helpers =====

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function endOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun
  // End of week = upcoming Saturday 23:59
  const diff = 6 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ===== Keys =====

export const dashKeys = {
  myTasks: (uid: string, ws: string) => ["dash", "my-tasks", uid, ws] as const,
  activity: (ws: string) => ["dash", "activity", ws] as const,
  overdue: (ws: string) => ["dash", "overdue", ws] as const,
  spaces: (ws: string) => ["dash", "spaces", ws] as const,
  priority: (ws: string) => ["dash", "priority", ws] as const,
  weekly: (ws: string) => ["dash", "weekly", ws] as const,
  config: (uid: string, ws: string) => ["dash", "config", uid, ws] as const,
};

// ===== Shared task fetcher =====

async function fetchTasks(filter: (q: ReturnType<typeof baseTasksQuery>) => ReturnType<typeof baseTasksQuery>) {
  const q = filter(baseTasksQuery());
  const { data, error } = await q;
  if (error) throw error;
  return mapTaskRows(data ?? []);
}

function baseTasksQuery() {
  return supabase
    .from("tasks")
    .select(
      "id,title,list_id,status_id,priority,due_date,completed_at,workspace_id," +
        "lists(name,space_id,spaces(name)),status_columns(name,color,is_done)",
    )
    .is("parent_task_id", null);
}

function mapTaskRows(rows: unknown[]): DashboardTask[] {
  return (rows as Array<{
    id: string;
    title: string;
    list_id: string;
    status_id: string | null;
    priority: Priority;
    due_date: string | null;
    completed_at: string | null;
    lists: { name: string; spaces: { name: string } | null } | null;
    status_columns: { name: string; color: string | null; is_done: boolean } | null;
  }>).map((r) => ({
    id: r.id,
    title: r.title,
    list_id: r.list_id,
    status_id: r.status_id,
    priority: r.priority,
    due_date: r.due_date,
    completed_at: r.completed_at,
    list_name: r.lists?.name ?? null,
    space_name: r.lists?.spaces?.name ?? null,
    status_name: r.status_columns?.name ?? null,
    status_color: r.status_columns?.color ?? null,
    status_is_done: r.status_columns?.is_done ?? false,
  }));
}

// ===== My Tasks =====

export function useMyTasks(userId: string | undefined, workspaceId: string | undefined) {
  return useQuery({
    queryKey: dashKeys.myTasks(userId ?? "", workspaceId ?? ""),
    enabled: !!userId && !!workspaceId,
    queryFn: async (): Promise<MyTasksGrouped> => {
      // Get task ids assigned to user via task_assignees within workspace
      const { data: ta, error: te } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", userId!)
        .eq("workspace_id", workspaceId!);
      if (te) throw te;
      const ids = (ta ?? []).map((r) => r.task_id);
      if (ids.length === 0) {
        return { overdue: [], today: [], thisWeek: [], future: [], all: [] };
      }
      const tasks = await fetchTasks((q) =>
        q.eq("workspace_id", workspaceId!).in("id", ids),
      );
      // Filter out done tasks
      const open = tasks.filter((t) => !t.status_is_done);

      const todayStart = startOfDay();
      const todayEnd = endOfDay();
      const weekEnd = endOfWeek();

      const overdue: DashboardTask[] = [];
      const today: DashboardTask[] = [];
      const thisWeek: DashboardTask[] = [];
      const future: DashboardTask[] = [];

      for (const t of open) {
        if (!t.due_date) {
          future.push(t);
          continue;
        }
        const d = new Date(t.due_date);
        if (d < todayStart) overdue.push(t);
        else if (d <= todayEnd) today.push(t);
        else if (d <= weekEnd) thisWeek.push(t);
        else future.push(t);
      }

      const sortByDue = (a: DashboardTask, b: DashboardTask) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ad - bd;
      };
      overdue.sort(sortByDue);
      today.sort(sortByDue);
      thisWeek.sort(sortByDue);
      future.sort(sortByDue);

      const all = [...overdue, ...today, ...thisWeek, ...future].slice(0, 15);
      return { overdue, today, thisWeek, future, all };
    },
  });
}

// ===== Overdue (workspace-wide) =====

export function useOverdueTasks(workspaceId: string | undefined) {
  return useQuery({
    queryKey: dashKeys.overdue(workspaceId ?? ""),
    enabled: !!workspaceId,
    queryFn: async () => {
      const todayIso = startOfDay().toISOString();
      const tasks = await fetchTasks((q) =>
        q.eq("workspace_id", workspaceId!).lt("due_date", todayIso).not("due_date", "is", null),
      );
      return tasks
        .filter((t) => !t.status_is_done)
        .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
    },
  });
}

// ===== Activity feed (paginated) =====

const ACTIVITY_PAGE_SIZE = 20;

export function useActivityFeed(workspaceId: string | undefined) {
  const qc = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: dashKeys.activity(workspaceId ?? ""),
    enabled: !!workspaceId,
    initialPageParam: 0,
    getNextPageParam: (last: ActivityLog[], pages) =>
      last.length < ACTIVITY_PAGE_SIZE ? undefined : pages.length,
    queryFn: async ({ pageParam }): Promise<ActivityLog[]> => {
      const offset = (pageParam as number) * ACTIVITY_PAGE_SIZE;
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id,workspace_id,actor_id,action,entity_type,entity_id,entity_title,metadata,created_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .range(offset, offset + ACTIVITY_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Omit<ActivityLog, "actor">[];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id)));
      let profiles: Record<string, ActivityLog["actor"]> = {};
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,email")
          .in("id", actorIds);
        profiles = Object.fromEntries((profs ?? []).map((p) => [p.id, p as ActivityLog["actor"]]));
      }
      return rows.map((r) => ({ ...r, actor: profiles[r.actor_id] ?? null }));
    },
  });

  // Realtime: prepend new events to the first page
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`activity-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `workspace_id=eq.${workspaceId}` },
        async (payload) => {
          const row = payload.new as Omit<ActivityLog, "actor">;
          const { data: prof } = await supabase
            .from("profiles")
            .select("id,display_name,avatar_url,email")
            .eq("id", row.actor_id)
            .maybeSingle();
          const enriched: ActivityLog = { ...row, actor: (prof as ActivityLog["actor"]) ?? null };

          qc.setQueryData<{ pages: ActivityLog[][]; pageParams: unknown[] }>(
            dashKeys.activity(workspaceId),
            (old) => {
              if (!old || old.pages.length === 0) {
                return { pages: [[enriched]], pageParams: [0] };
              }
              const [first, ...rest] = old.pages;
              if (first.some((e) => e.id === enriched.id)) return old;
              return { ...old, pages: [[enriched, ...first], ...rest] };
            },
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);

  return query;
}

// ===== Spaces progress =====

export function useSpaceProgress(workspaceId: string | undefined) {
  return useQuery({
    queryKey: dashKeys.spaces(workspaceId ?? ""),
    enabled: !!workspaceId,
    queryFn: async (): Promise<SpaceProgress[]> => {
      const { data: spaces, error: se } = await supabase
        .from("spaces")
        .select("id,name,color,icon")
        .eq("workspace_id", workspaceId!)
        .order("position");
      if (se) throw se;
      const spaceList = spaces ?? [];
      if (spaceList.length === 0) return [];

      // Get all tasks for workspace with status is_done flag
      const { data: tasks, error: te } = await supabase
        .from("tasks")
        .select("id,workspace_id,list_id,status_columns(is_done),lists(space_id)")
        .eq("workspace_id", workspaceId!)
        .is("parent_task_id", null);
      if (te) throw te;

      const counts = new Map<string, { total: number; completed: number }>();
      spaceList.forEach((s) => counts.set(s.id, { total: 0, completed: 0 }));

      (tasks ?? []).forEach((t: unknown) => {
        const row = t as { lists: { space_id: string } | null; status_columns: { is_done: boolean } | null };
        const sid = row.lists?.space_id;
        if (!sid || !counts.has(sid)) return;
        const c = counts.get(sid)!;
        c.total += 1;
        if (row.status_columns?.is_done) c.completed += 1;
      });

      return spaceList.map((s) => ({
        space_id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        total: counts.get(s.id)?.total ?? 0,
        completed: counts.get(s.id)?.completed ?? 0,
      }));
    },
  });
}

// ===== Priority overview =====

export function usePriorityOverview(workspaceId: string | undefined) {
  return useQuery({
    queryKey: dashKeys.priority(workspaceId ?? ""),
    enabled: !!workspaceId,
    queryFn: async (): Promise<PriorityBucket[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("priority,status_columns(is_done)")
        .eq("workspace_id", workspaceId!)
        .is("parent_task_id", null);
      if (error) throw error;
      const counts: Record<Priority, number> = { urgent: 0, high: 0, medium: 0, low: 0 };
      (data ?? []).forEach((r: unknown) => {
        const row = r as { priority: Priority; status_columns: { is_done: boolean } | null };
        if (row.status_columns?.is_done) return;
        counts[row.priority] = (counts[row.priority] ?? 0) + 1;
      });
      return [
        { priority: "urgent", count: counts.urgent },
        { priority: "high", count: counts.high },
        { priority: "medium", count: counts.medium },
        { priority: "low", count: counts.low },
      ];
    },
  });
}

// ===== Weekly activity (last 7 days) =====

export function useWeeklyActivity(workspaceId: string | undefined) {
  return useQuery({
    queryKey: dashKeys.weekly(workspaceId ?? ""),
    enabled: !!workspaceId,
    queryFn: async (): Promise<WeeklyActivityPoint[]> => {
      const since = startOfDay();
      since.setDate(since.getDate() - 6);
      const sinceIso = since.toISOString();

      const { data, error } = await supabase
        .from("activity_logs")
        .select("action,created_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", sinceIso)
        .in("action", ["task_created", "task_completed"]);
      if (error) throw error;

      const days: WeeklyActivityPoint[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(since);
        d.setDate(d.getDate() + i);
        days.push({ date: d.toISOString().slice(0, 10), created: 0, completed: 0 });
      }
      const idx = new Map(days.map((d, i) => [d.date, i]));
      (data ?? []).forEach((r: { action: string; created_at: string }) => {
        const key = new Date(r.created_at).toISOString().slice(0, 10);
        const i = idx.get(key);
        if (i === undefined) return;
        if (r.action === "task_created") days[i].created += 1;
        if (r.action === "task_completed") days[i].completed += 1;
      });
      return days;
    },
  });
}

// ===== Widget config =====

export const ALL_WIDGETS = [
  "my-tasks",
  "activity-feed",
  "overdue-tasks",
  "space-progress",
  "priority-overview",
  "weekly-activity",
  "goals-overview",
] as const;

export type WidgetType = (typeof ALL_WIDGETS)[number];

export interface ResolvedWidget {
  widget_type: WidgetType;
  position: number;
  is_visible: boolean;
  config: Record<string, unknown>;
}

export function useDashboardConfig(userId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: dashKeys.config(userId ?? "", workspaceId ?? ""),
    enabled: !!userId && !!workspaceId,
    queryFn: async (): Promise<ResolvedWidget[]> => {
      const { data, error } = await supabase
        .from("dashboard_widget_configs")
        .select("widget_type,position,is_visible,config")
        .eq("user_id", userId!)
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      const stored = new Map(
        (data ?? []).map((r) => [
          r.widget_type as WidgetType,
          {
            widget_type: r.widget_type as WidgetType,
            position: r.position,
            is_visible: r.is_visible,
            config: (r.config as Record<string, unknown>) ?? {},
          },
        ]),
      );
      // Merge with defaults
      const merged: ResolvedWidget[] = ALL_WIDGETS.map((w, i) => {
        const s = stored.get(w);
        return s ?? { widget_type: w, position: i, is_visible: true, config: {} };
      });
      merged.sort((a, b) => a.position - b.position);
      return merged;
    },
  });

  const save = useMutation({
    mutationFn: async (widgets: ResolvedWidget[]) => {
      if (!userId || !workspaceId) throw new Error("Sessão inválida");
      const rows = widgets.map((w, i) => ({
        user_id: userId,
        workspace_id: workspaceId,
        widget_type: w.widget_type,
        position: i,
        is_visible: w.is_visible,
        config: w.config as never,
      }));
      const { error } = await supabase
        .from("dashboard_widget_configs")
        .upsert(rows, { onConflict: "user_id,workspace_id,widget_type" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dashKeys.config(userId ?? "", workspaceId ?? "") });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, save };
}
