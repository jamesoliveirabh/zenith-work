import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type DebtCategory = "refactoring" | "performance" | "security" | "testing" | "documentation";
export type DebtSeverity = "low" | "medium" | "high" | "critical";
export type SpikeStatus = "planned" | "in_progress" | "completed" | "abandoned";
export type PrStatus = "open" | "merged" | "closed" | "draft";

export interface TechnicalDebtItem {
  id: string;
  workspace_id: string;
  team_id: string | null;
  task_id: string | null;
  title: string;
  description: string | null;
  category: DebtCategory;
  severity: DebtSeverity;
  estimated_points: number | null;
  impact_score: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolution_sprint_id: string | null;
}

export interface TechSpike {
  id: string;
  workspace_id: string;
  team_id: string;
  task_id: string | null;
  title: string;
  goal: string | null;
  duration_hours: number | null;
  status: SpikeStatus;
  started_at: string | null;
  completed_at: string | null;
  findings: string | null;
  recommended_action: string | null;
  story_points_to_implement: number | null;
  created_by: string;
  created_at: string;
}

export interface PullRequest {
  id: string;
  workspace_id: string;
  task_id: string | null;
  pr_id: string;
  repository: string;
  pr_number: number;
  title: string | null;
  author: string | null;
  status: PrStatus;
  created_at: string | null;
  merged_at: string | null;
  review_count: number;
  ci_status: "pending" | "success" | "failure" | "error" | null;
  ci_url: string | null;
}

export interface CodeQualityMetric {
  id: string;
  team_id: string;
  sprint_id: string | null;
  date: string;
  test_coverage_percentage: number | null;
  linting_issues: number;
  code_smells: number;
  duplicated_lines_percentage: number;
  cyclomatic_complexity: number;
  security_vulnerabilities: number;
  source: string | null;
}

export const techDebtKey = (wsId: string, teamId?: string | null) =>
  ["tech-debt", wsId, teamId ?? "all"] as const;
export const techSpikesKey = (teamId: string) => ["tech-spikes", teamId] as const;
export const prsKey = (wsId: string, taskId?: string | null) =>
  ["prs", wsId, taskId ?? "all"] as const;
export const qualityKey = (teamId: string) => ["code-quality", teamId] as const;

// ---------- Technical Debt ----------
export function useTechnicalDebt(teamId?: string | null) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: techDebtKey(current?.id ?? "", teamId),
    enabled: !!current?.id,
    queryFn: async (): Promise<TechnicalDebtItem[]> => {
      let q = supabase.from("technical_debt_items").select("*")
        .eq("workspace_id", current!.id)
        .order("severity", { ascending: false })
        .order("impact_score", { ascending: false, nullsFirst: false });
      if (teamId) q = q.eq("team_id", teamId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TechnicalDebtItem[];
    },
  });
}

export function useCreateTechDebt() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Omit<Partial<TechnicalDebtItem>, "id" | "workspace_id" | "created_by" | "created_at" | "updated_at" | "is_resolved"> & { title: string; category: DebtCategory; severity: DebtSeverity }) => {
      const { error } = await supabase.from("technical_debt_items").insert({
        workspace_id: current!.id,
        created_by: user!.id,
        title: input.title.trim(),
        description: input.description ?? null,
        category: input.category,
        severity: input.severity,
        team_id: input.team_id ?? null,
        task_id: input.task_id ?? null,
        estimated_points: input.estimated_points ?? null,
        impact_score: input.impact_score ?? null,
        due_date: input.due_date ?? null,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Item de débito técnico criado");
      qc.invalidateQueries({ queryKey: ["tech-debt"] });
    },
  });
}

export function useUpdateTechDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TechnicalDebtItem> }) => {
      const { error } = await supabase.from("technical_debt_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-debt"] }),
  });
}

export function useResolveTechDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sprintId }: { id: string; sprintId?: string }) => {
      const { error } = await supabase.from("technical_debt_items").update({
        is_resolved: true, resolved_at: new Date().toISOString(),
        resolution_sprint_id: sprintId ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Débito marcado como resolvido");
      qc.invalidateQueries({ queryKey: ["tech-debt"] });
    },
  });
}

export function useDeleteTechDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("technical_debt_items").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-debt"] }),
  });
}

// ---------- Tech Spikes ----------
export function useTechSpikes(teamId: string | null | undefined) {
  return useQuery({
    queryKey: techSpikesKey(teamId ?? ""),
    enabled: !!teamId,
    queryFn: async (): Promise<TechSpike[]> => {
      const { data, error } = await supabase.from("tech_spikes")
        .select("*").eq("team_id", teamId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TechSpike[];
    },
  });
}

export function useCreateSpike() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { team_id: string; title: string; goal?: string; duration_hours?: number }) => {
      const { error } = await supabase.from("tech_spikes").insert({
        workspace_id: current!.id,
        team_id: input.team_id,
        title: input.title.trim(),
        goal: input.goal?.trim() || null,
        duration_hours: input.duration_hours ?? null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("Spike criado");
      qc.invalidateQueries({ queryKey: ["tech-spikes"] });
    },
  });
}

export function useUpdateSpike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TechSpike> }) => {
      const { error } = await supabase.from("tech_spikes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-spikes"] }),
  });
}

export function useDeleteSpike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tech_spikes").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-spikes"] }),
  });
}

// ---------- Pull Requests ----------
export function usePullRequests(taskId?: string | null) {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: prsKey(current?.id ?? "", taskId),
    enabled: !!current?.id,
    queryFn: async (): Promise<PullRequest[]> => {
      let q = supabase.from("pull_requests_sync").select("*")
        .eq("workspace_id", current!.id)
        .order("synced_at", { ascending: false });
      if (taskId) q = q.eq("task_id", taskId);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data ?? []) as PullRequest[];
    },
  });
}

export function useUpsertPullRequest() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async (input: Omit<PullRequest, "id" | "workspace_id">) => {
      const { error } = await supabase.from("pull_requests_sync").upsert({
        workspace_id: current!.id,
        ...input,
        synced_at: new Date().toISOString(),
      }, { onConflict: "pr_id,repository" });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success("PR sincronizado");
      qc.invalidateQueries({ queryKey: ["prs"] });
    },
  });
}

// ---------- Code Quality ----------
export function useCodeQualityMetrics(teamId: string | null | undefined) {
  return useQuery({
    queryKey: qualityKey(teamId ?? ""),
    enabled: !!teamId,
    queryFn: async (): Promise<CodeQualityMetric[]> => {
      const { data, error } = await supabase.from("code_quality_metrics")
        .select("*").eq("team_id", teamId!).order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CodeQualityMetric[];
    },
  });
}
