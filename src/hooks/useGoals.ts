import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { assertEntitlement, decrementUsage, EntitlementBlockedError } from "@/lib/billing/enforcement";
import { useEntitlementGuard } from "@/components/billing/EntitlementGuardProvider";

export type GoalFilter = "all" | "mine" | "archived";

export interface Goal {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  owner_id: string;
  start_date: string | null;
  due_date: string | null;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  progress?: number;
  targets?: GoalTarget[];
  members?: { user_id: string }[];
  owner?: { id: string; display_name: string | null; avatar_url: string | null };
}

export interface GoalTarget {
  id: string;
  goal_id: string;
  workspace_id: string;
  name: string;
  target_type: "number" | "percentage" | "currency" | "true_false" | "task_count";
  initial_value: number;
  current_value: number;
  target_value: number;
  unit: string | null;
  list_id: string | null;
  task_filter: any;
  position: number;
  created_at: string;
}

async function fetchProgress(goalId: string): Promise<number> {
  const { data } = await supabase.rpc("calculate_goal_progress", { _goal_id: goalId });
  return Number(data ?? 0);
}

export function useGoals(workspaceId: string | undefined, filter: GoalFilter = "all") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["goals", workspaceId, filter, user?.id],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("goals")
        .select("*, targets:goal_targets(*), members:goal_members(user_id)")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (filter === "archived") q = q.eq("is_archived", true);
      else q = q.eq("is_archived", false);
      if (filter === "mine" && user) q = q.eq("owner_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      const goals = (data ?? []) as any[];
      const progresses = await Promise.all(goals.map((g) => fetchProgress(g.id)));
      return goals.map((g, i) => ({ ...g, progress: progresses[i] })) as Goal[];
    },
  });
}

export function useGoalDetail(goalId: string | undefined) {
  return useQuery({
    queryKey: ["goal", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*, targets:goal_targets(*), members:goal_members(user_id)")
        .eq("id", goalId!)
        .single();
      if (error) throw error;
      const progress = await fetchProgress(goalId!);
      const ownerRes = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", data.owner_id)
        .maybeSingle();
      return {
        ...data,
        progress,
        owner: ownerRes.data ?? undefined,
        targets: ((data as any).targets ?? []).sort((a: any, b: any) => a.position - b.position),
      } as Goal;
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const guard = useEntitlementGuard();
  return useMutation({
    mutationFn: async (input: { workspace_id: string; name: string; color?: string; description?: string; due_date?: string | null; start_date?: string | null }) => {
      await assertEntitlement({
        workspaceId: input.workspace_id,
        featureKey: "active_goals",
        incrementBy: 1,
        action: "goal.create",
        commitUsage: true,
      });
      const { data, error } = await supabase
        .from("goals")
        .insert({
          workspace_id: input.workspace_id,
          name: input.name,
          color: input.color ?? "#7C3AED",
          description: input.description,
          due_date: input.due_date,
          start_date: input.start_date,
          owner_id: user!.id,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) {
        await decrementUsage(input.workspace_id, "active_goals", 1);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal criado");
    },
    onError: (e: any) => {
      if (e instanceof EntitlementBlockedError) {
        guard.handleError(e);
        return;
      }
      toast.error(e.message);
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Goal> & { id: string }) => {
      const { progress, targets, members, owner, ...rest } = patch as any;
      const { error } = await supabase.from("goals").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["goal", v.id] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useArchiveGoal() {
  const qc = useQueryClient();
  const guard = useEntitlementGuard();
  return useMutation({
    mutationFn: async ({ id, archived, workspace_id }: { id: string; archived: boolean; workspace_id?: string }) => {
      // Unarchive consome 1 vaga; archive devolve.
      if (!archived && workspace_id) {
        await assertEntitlement({
          workspaceId: workspace_id,
          featureKey: "active_goals",
          incrementBy: 1,
          action: "goal.unarchive",
          commitUsage: true,
        });
      }
      const { error } = await supabase.from("goals").update({ is_archived: archived }).eq("id", id);
      if (error) {
        if (!archived && workspace_id) await decrementUsage(workspace_id, "active_goals", 1);
        throw error;
      }
      if (archived && workspace_id) {
        await decrementUsage(workspace_id, "active_goals", 1);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal atualizado");
    },
    onError: (e: any) => {
      if (e instanceof EntitlementBlockedError) { guard.handleError(e); return; }
      toast.error(e.message);
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: { id: string; workspace_id?: string; is_archived?: boolean }) => {
      const { error } = await supabase.from("goals").delete().eq("id", g.id);
      if (error) throw error;
      if (!g.is_archived && g.workspace_id) {
        await decrementUsage(g.workspace_id, "active_goals", 1);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal removido");
    },
  });
}

export function useDuplicateGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (goal: Goal) => {
      const { data: newGoal, error } = await supabase
        .from("goals")
        .insert({
          workspace_id: goal.workspace_id,
          name: `${goal.name} (cópia)`,
          color: goal.color,
          description: goal.description,
          start_date: goal.start_date,
          due_date: goal.due_date,
          owner_id: user!.id,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      if (goal.targets?.length) {
        await supabase.from("goal_targets").insert(
          goal.targets.map((t) => ({
            goal_id: newGoal.id,
            workspace_id: goal.workspace_id,
            name: t.name,
            target_type: t.target_type,
            initial_value: t.initial_value,
            current_value: t.initial_value,
            target_value: t.target_value,
            unit: t.unit,
            list_id: t.list_id,
            task_filter: t.task_filter,
            position: t.position,
          }))
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal duplicado");
    },
  });
}

export function useCreateTarget(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<GoalTarget, "id" | "created_at" | "goal_id" | "position">) => {
      const { count } = await supabase
        .from("goal_targets")
        .select("id", { count: "exact", head: true })
        .eq("goal_id", goalId);
      const { error } = await supabase.from("goal_targets").insert({
        ...input,
        goal_id: goalId,
        position: count ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, goal_id, ...patch }: Partial<GoalTarget> & { id: string; goal_id: string }) => {
      const { error } = await supabase.from("goal_targets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["goal", v.goal_id] });
      const prev = qc.getQueryData<any>(["goal", v.goal_id]);
      if (prev) {
        qc.setQueryData(["goal", v.goal_id], {
          ...prev,
          targets: prev.targets.map((t: any) => (t.id === v.id ? { ...t, ...v } : t)),
        });
      }
      return { prev };
    },
    onError: (_e, v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["goal", v.goal_id], ctx.prev);
      toast.error("Erro ao atualizar target");
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["goal", v.goal_id] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useDeleteTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; goal_id: string }) => {
      const { error } = await supabase.from("goal_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["goal", v.goal_id] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useReorderTargets(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("goal_targets").update({ position: idx }).eq("id", id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goal", goalId] }),
  });
}

export function useGoalMembers(goalId: string | undefined) {
  return useQuery({
    queryKey: ["goal-members", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("goal_members")
        .select("user_id")
        .eq("goal_id", goalId!);
      if (error) throw error;
      const ids = (members ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email")
        .in("id", ids);
      return profiles ?? [];
    },
  });
}

export function useAddGoalMember(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("goal_members")
        .insert({ goal_id: goalId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal-members", goalId] });
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRemoveGoalMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal_id, user_id }: { goal_id: string; user_id: string }) => {
      const { error } = await supabase
        .from("goal_members")
        .delete()
        .eq("goal_id", goal_id)
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["goal-members", v.goal_id] });
      qc.invalidateQueries({ queryKey: ["goal", v.goal_id] });
    },
  });
}
