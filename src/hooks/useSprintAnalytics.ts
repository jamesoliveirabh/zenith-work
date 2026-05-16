import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type RetroCategory = "keep" | "start" | "stop";
export type RetroStatus = "scheduled" | "in_progress" | "completed";

export interface SprintMetricPoint {
  date: string;
  points_completed: number;
  points_in_progress: number;
  points_remaining: number;
  velocity_percentage: number;
  avg_points_per_task: number;
  task_completion_rate: number;
  blocked_tasks_count: number;
}

export interface SprintReport {
  id: string;
  sprint_id: string;
  team_id: string;
  workspace_id: string;
  generated_at: string;
  planned_velocity: number | null;
  actual_velocity: number | null;
  completion_percentage: number | null;
  team_members_count: number | null;
  avg_story_points_per_person: number | null;
  longest_task_days: number | null;
  blockers_summary: string | null;
  achievements: string | null;
  improvements: string | null;
  report_json: Record<string, unknown>;
}

export interface Retrospective {
  id: string;
  sprint_id: string;
  team_id: string;
  workspace_id: string;
  conducted_at: string | null;
  status: RetroStatus;
  created_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RetrospectiveItem {
  id: string;
  retrospective_id: string;
  category: RetroCategory;
  content: string;
  votes: number;
  is_action_item: boolean;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  has_voted?: boolean;
}

export const sprintMetricsKey = (sprintId: string) => ["sprint-metrics", sprintId] as const;
export const sprintReportKey = (sprintId: string) => ["sprint-report", sprintId] as const;
export const retrospectiveKey = (sprintId: string) => ["retrospective", sprintId] as const;
export const retroItemsKey = (retroId: string) => ["retro-items", retroId] as const;

export function useSprintMetrics(sprintId: string | null | undefined) {
  return useQuery({
    queryKey: sprintMetricsKey(sprintId ?? ""),
    enabled: !!sprintId,
    queryFn: async (): Promise<SprintMetricPoint[]> => {
      const { data, error } = await supabase
        .from("sprint_metrics")
        .select("*")
        .eq("sprint_id", sprintId!)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SprintMetricPoint[];
    },
  });
}

export function useSprintReport(sprintId: string | null | undefined) {
  return useQuery({
    queryKey: sprintReportKey(sprintId ?? ""),
    enabled: !!sprintId,
    queryFn: async (): Promise<SprintReport | null> => {
      const { data, error } = await supabase
        .from("sprint_reports")
        .select("*")
        .eq("sprint_id", sprintId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as SprintReport | null;
    },
  });
}

export function useRetrospective(sprintId: string | null | undefined) {
  return useQuery({
    queryKey: retrospectiveKey(sprintId ?? ""),
    enabled: !!sprintId,
    queryFn: async (): Promise<Retrospective | null> => {
      const { data, error } = await supabase
        .from("retrospectives")
        .select("*")
        .eq("sprint_id", sprintId!)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Retrospective | null;
    },
  });
}

export function useRetrospectiveItems(retroId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: retroItemsKey(retroId ?? ""),
    enabled: !!retroId,
    queryFn: async (): Promise<RetrospectiveItem[]> => {
      const { data, error } = await supabase
        .from("retrospective_items")
        .select("*")
        .eq("retrospective_id", retroId!)
        .order("votes", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const items = (data ?? []) as unknown as RetrospectiveItem[];
      if (!user || items.length === 0) return items;
      const { data: votes } = await supabase
        .from("retrospective_item_votes")
        .select("retrospective_item_id")
        .eq("user_id", user.id)
        .in("retrospective_item_id", items.map((i) => i.id));
      const voted = new Set((votes ?? []).map((v) => v.retrospective_item_id));
      return items.map((i) => ({ ...i, has_voted: voted.has(i.id) }));
    },
  });
}

export function useCreateRetrospective() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { sprint_id: string; team_id: string; workspace_id: string }) => {
      const { data, error } = await supabase
        .from("retrospectives")
        .insert({
          sprint_id: input.sprint_id,
          team_id: input.team_id,
          workspace_id: input.workspace_id,
          status: "in_progress",
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Retrospective;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (r) => {
      toast.success("Retrospectiva iniciada");
      qc.invalidateQueries({ queryKey: retrospectiveKey(r.sprint_id) });
    },
  });
}

export function useUpdateRetrospective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, sprintId: _s, patch,
    }: { id: string; sprintId: string; patch: Partial<Retrospective> }) => {
      const { error } = await supabase.from("retrospectives").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: retrospectiveKey(vars.sprintId) }),
  });
}

export function useAddRetroItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { retrospective_id: string; category: RetroCategory; content: string }) => {
      const { error } = await supabase.from("retrospective_items").insert({
        retrospective_id: input.retrospective_id,
        category: input.category,
        content: input.content.trim(),
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: retroItemsKey(v.retrospective_id) }),
  });
}

export function useUpdateRetroItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, retroId: _r, patch,
    }: { id: string; retroId: string; patch: Partial<Omit<RetrospectiveItem, "has_voted">> }) => {
      const { error } = await supabase.from("retrospective_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: retroItemsKey(v.retroId) }),
  });
}

export function useDeleteRetroItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, retroId: _r }: { id: string; retroId: string }) => {
      const { error } = await supabase.from("retrospective_items").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: retroItemsKey(v.retroId) }),
  });
}

export function useToggleRetroVote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ itemId, retroId: _r, voted }: { itemId: string; retroId: string; voted: boolean }) => {
      if (voted) {
        const { error } = await supabase
          .from("retrospective_item_votes")
          .delete()
          .eq("retrospective_item_id", itemId)
          .eq("user_id", user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("retrospective_item_votes")
          .insert({ retrospective_item_id: itemId, user_id: user!.id });
        if (error) throw error;
      }
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: retroItemsKey(v.retroId) }),
  });
}
