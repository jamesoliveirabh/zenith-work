import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type SprintStatus = "planning" | "active" | "completed" | "archived";
export type SprintTaskStatus = "todo" | "in_progress" | "done";
export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const;

export interface Sprint {
  id: string;
  workspace_id: string;
  team_id: string;
  name: string;
  description: string | null;
  status: SprintStatus;
  start_date: string;
  end_date: string;
  goal: string | null;
  planned_velocity: number;
  actual_velocity: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  is_deleted: boolean;
}

export interface SprintTask {
  id: string;
  sprint_id: string;
  task_id: string;
  story_points: number | null;
  order: number;
  status_in_sprint: SprintTaskStatus;
  added_at: string;
  completed_at: string | null;
  task?: {
    id: string;
    title: string;
    list_id: string;
  } | null;
}

export interface VelocityRecord {
  id: string;
  team_id: string;
  sprint_id: string;
  planned_velocity: number;
  actual_velocity: number;
  completion_rate: number;
  created_at: string;
  sprint?: { name: string; start_date: string; end_date: string } | null;
}

export const sprintsKey = (teamId: string) => ["sprints", teamId] as const;
export const sprintTasksKey = (sprintId: string) => ["sprint-tasks", sprintId] as const;
export const velocityHistoryKey = (teamId: string) => ["velocity-history", teamId] as const;

export function useSprints(teamId: string | null | undefined) {
  return useQuery({
    queryKey: sprintsKey(teamId ?? ""),
    enabled: !!teamId,
    queryFn: async (): Promise<Sprint[]> => {
      const { data, error } = await supabase
        .from("sprints")
        .select("*")
        .eq("team_id", teamId!)
        .eq("is_deleted", false)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sprint[];
    },
  });
}

export function useSprintTasks(sprintId: string | null | undefined) {
  return useQuery({
    queryKey: sprintTasksKey(sprintId ?? ""),
    enabled: !!sprintId,
    queryFn: async (): Promise<SprintTask[]> => {
      const { data, error } = await supabase
        .from("sprint_tasks")
        .select("*, task:tasks(id, title, list_id)")
        .eq("sprint_id", sprintId!)
        .order("order");
      if (error) throw error;
      return (data ?? []) as unknown as SprintTask[];
    },
  });
}

export function useVelocityHistory(teamId: string | null | undefined) {
  return useQuery({
    queryKey: velocityHistoryKey(teamId ?? ""),
    enabled: !!teamId,
    queryFn: async (): Promise<VelocityRecord[]> => {
      const { data, error } = await supabase
        .from("velocity_history")
        .select("*, sprint:sprints(name, start_date, end_date)")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VelocityRecord[];
    },
  });
}

export function useCreateSprint() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      team_id: string;
      name: string;
      description?: string;
      start_date: string;
      end_date: string;
      goal?: string;
    }) => {
      const { data, error } = await supabase
        .from("sprints")
        .insert({
          workspace_id: current!.id,
          team_id: input.team_id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          start_date: input.start_date,
          end_date: input.end_date,
          goal: input.goal?.trim() || null,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Sprint;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (sprint) => {
      toast.success("Sprint criada");
      qc.invalidateQueries({ queryKey: sprintsKey(sprint.team_id) });
    },
  });
}

export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, teamId: _t }: { id: string; teamId: string; patch: Partial<Sprint> }) => {
      const { error } = await supabase.from("sprints").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: sprintsKey(vars.teamId) });
      qc.invalidateQueries({ queryKey: velocityHistoryKey(vars.teamId) });
    },
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, teamId: _t }: { id: string; teamId: string }) => {
      const { error } = await supabase.from("sprints").update({ is_deleted: true }).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success("Sprint removida");
      qc.invalidateQueries({ queryKey: sprintsKey(vars.teamId) });
    },
  });
}

export function useAddTaskToSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sprint_id: string; task_id: string; story_points?: number | null }) => {
      const { error } = await supabase.from("sprint_tasks").insert({
        sprint_id: input.sprint_id,
        task_id: input.task_id,
        story_points: input.story_points ?? null,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: sprintTasksKey(vars.sprint_id) });
    },
  });
}

export function useUpdateSprintTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, sprint_id: _s, patch,
    }: { id: string; sprint_id: string; patch: { story_points?: number | null; status_in_sprint?: SprintTaskStatus; order?: number } }) => {
      const { error } = await supabase.from("sprint_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: sprintTasksKey(vars.sprint_id) });
    },
  });
}

export function useRemoveSprintTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sprint_id: _s }: { id: string; sprint_id: string }) => {
      const { error } = await supabase.from("sprint_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: sprintTasksKey(vars.sprint_id) });
    },
  });
}
