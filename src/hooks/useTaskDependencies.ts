import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type DependencyType = "blocks" | "blocked_by" | "related_to";

export interface RelatedTaskRef {
  dependencyId: string;
  taskId: string;
  title: string;
  statusId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface TaskDependencies {
  blocks: RelatedTaskRef[];
  blockedBy: RelatedTaskRef[];
  relatedTo: RelatedTaskRef[];
}

export const taskDependenciesKey = (taskId: string) =>
  ["task-dependencies", taskId] as const;
export const blockedByChainKey = (taskId: string) =>
  ["task-blocked-by-chain", taskId] as const;

interface DependencyRow {
  id: string;
  source_task_id: string;
  target_task_id: string;
  dependency_type: DependencyType;
  created_at: string;
  created_by: string | null;
  source_task: { id: string; title: string; status_id: string | null } | null;
  target_task: { id: string; title: string; status_id: string | null } | null;
}

const SELECT = `
  id, source_task_id, target_task_id, dependency_type, created_at, created_by,
  source_task:tasks!task_dependencies_source_task_id_fkey(id,title,status_id),
  target_task:tasks!task_dependencies_target_task_id_fkey(id,title,status_id)
`;

/** Fetch all dependencies of a task, grouped by relation. */
export function useTaskDependencies(taskId: string | undefined) {
  return useQuery({
    queryKey: taskDependenciesKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskDependencies> => {
      const id = taskId!;
      const { data, error } = await supabase
        .from("task_dependencies")
        .select(SELECT)
        .or(`source_task_id.eq.${id},target_task_id.eq.${id}`);
      if (error) throw error;

      const result: TaskDependencies = { blocks: [], blockedBy: [], relatedTo: [] };
      for (const r of (data ?? []) as unknown as DependencyRow[]) {
        const isSource = r.source_task_id === id;
        const other = isSource ? r.target_task : r.source_task;
        if (!other) continue;

        const ref: RelatedTaskRef = {
          dependencyId: r.id,
          taskId: other.id,
          title: other.title,
          statusId: other.status_id,
          createdAt: r.created_at,
          createdBy: r.created_by,
        };

        // Normalize from current task's perspective:
        //   source 'blocks' target  → current blocks other (if source) / current blockedBy other (if target)
        //   source 'blocked_by' target → current blockedBy other (if source) / current blocks other (if target)
        //   'related_to' is symmetric.
        if (r.dependency_type === "related_to") {
          result.relatedTo.push(ref);
        } else if (r.dependency_type === "blocks") {
          (isSource ? result.blocks : result.blockedBy).push(ref);
        } else {
          (isSource ? result.blockedBy : result.blocks).push(ref);
        }
      }
      return result;
    },
  });
}

interface CreateInput {
  sourceTaskId: string;
  targetTaskId: string;
  dependencyType: DependencyType;
}

interface CheckResult {
  valid: boolean;
  error?: string;
  message?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  circular: "Não é possível criar esta dependência (circular)",
  self_reference: "Uma tarefa não pode depender de si mesma",
  workspace_mismatch: "As tarefas pertencem a workspaces diferentes",
  task_not_found: "Tarefa não encontrada",
  missing_task: "Selecione uma tarefa",
};

/** Create a dependency. Validates against cycles via SQL function before insert. */
export function useCreateDependency(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ sourceTaskId, targetTaskId, dependencyType }: CreateInput) => {
      if (!workspaceId) throw new Error("Workspace não informado");
      if (!user) throw new Error("Usuário não autenticado");

      // Pre-flight validation (server-side authoritative).
      const { data: check, error: rpcErr } = await supabase.rpc(
        "check_circular_dependency",
        {
          source_id: sourceTaskId,
          target_id: targetTaskId,
          workspace_id: workspaceId,
          dep_type: dependencyType,
        },
      );
      if (rpcErr) throw rpcErr;
      const result = (check ?? {}) as CheckResult;
      if (result.valid === false) {
        throw new Error(
          result.message ||
            ERROR_MESSAGES[result.error ?? ""] ||
            "Dependência inválida",
        );
      }

      const { data, error } = await supabase
        .from("task_dependencies")
        .insert({
          workspace_id: workspaceId,
          source_task_id: sourceTaskId,
          target_task_id: targetTaskId,
          dependency_type: dependencyType,
          created_by: user.id,
        })
        .select("id, source_task_id, target_task_id")
        .single();
      if (error) {
        // Postgres error code → friendlier message.
        const code = (error as { code?: string }).code;
        const lower = error.message?.toLowerCase() ?? "";
        if (code === "42501" || lower.includes("row-level security")) {
          throw new Error("Você não tem permissão para editar esta task");
        }
        if (code === "23505" || lower.includes("duplicate") || lower.includes("unique")) {
          throw new Error("Esta dependência já existe");
        }
        if (code === "23514" || lower.includes("circular") || lower.includes("check")) {
          throw new Error("Não é possível criar esta dependência (circular)");
        }
        throw error;
      }
      return data;
    },
    retry: 1,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: taskDependenciesKey(data.source_task_id) });
      qc.invalidateQueries({ queryKey: taskDependenciesKey(data.target_task_id) });
      qc.invalidateQueries({ queryKey: blockedByChainKey(data.source_task_id) });
      qc.invalidateQueries({ queryKey: blockedByChainKey(data.target_task_id) });
      toast.success("Dependência criada com sucesso");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao criar dependência");
    },
  });
}

interface DeleteInput {
  dependencyId: string;
  /** Optional: invalidate cache for these task ids. */
  sourceTaskId?: string;
  targetTaskId?: string;
}

export function useDeleteDependency(_workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dependencyId }: DeleteInput) => {
      const { data, error } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("id", dependencyId)
        .select("source_task_id, target_task_id")
        .single();
      if (error) throw error;
      return data;
    },
    retry: 1,
    onSuccess: (data, vars) => {
      const ids = [data?.source_task_id, data?.target_task_id, vars.sourceTaskId, vars.targetTaskId]
        .filter((x): x is string => !!x);
      for (const id of new Set(ids)) {
        qc.invalidateQueries({ queryKey: taskDependenciesKey(id) });
        qc.invalidateQueries({ queryKey: blockedByChainKey(id) });
      }
      toast.success("Dependência removida");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao remover dependência");
    },
  });
}

export interface BlockingTaskNode {
  taskId: string;
  title: string;
  statusId: string | null;
  /** Distance in edges from the original task (1 = direct blocker). */
  depth: number;
}

/**
 * Returns the recursive set of tasks blocking `taskId`.
 * If A blocks B and B blocks C, then for C this returns [B (depth 1), A (depth 2)].
 */
export function useBlockedByTasks(taskId: string | undefined) {
  return useQuery({
    queryKey: blockedByChainKey(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async (): Promise<BlockingTaskNode[]> => {
      const start = taskId!;
      const visited = new Map<string, BlockingTaskNode>();
      let frontier: string[] = [start];
      let depth = 1;
      const MAX_DEPTH = 25; // safety guard; cycles are prevented at write-time

      while (frontier.length > 0 && depth <= MAX_DEPTH) {
        // Edges where `frontier` task is blocked:
        //   (a) someone has dependency_type='blocks' with target = frontier  → source blocks frontier
        //   (b) frontier itself has dependency_type='blocked_by' with target = blocker
        const [{ data: a, error: ea }, { data: b, error: eb }] = await Promise.all([
          supabase
            .from("task_dependencies")
            .select("source_task_id, source_task:tasks!task_dependencies_source_task_id_fkey(id,title,status_id)")
            .eq("dependency_type", "blocks")
            .in("target_task_id", frontier),
          supabase
            .from("task_dependencies")
            .select("target_task_id, target_task:tasks!task_dependencies_target_task_id_fkey(id,title,status_id)")
            .eq("dependency_type", "blocked_by")
            .in("source_task_id", frontier),
        ]);
        if (ea) throw ea;
        if (eb) throw eb;

        const next: string[] = [];
        const collect = (
          t: { id: string; title: string; status_id: string | null } | null,
        ) => {
          if (!t || t.id === start || visited.has(t.id)) return;
          visited.set(t.id, {
            taskId: t.id,
            title: t.title,
            statusId: t.status_id,
            depth,
          });
          next.push(t.id);
        };
        for (const row of (a ?? []) as Array<{ source_task: { id: string; title: string; status_id: string | null } | null }>) {
          collect(row.source_task);
        }
        for (const row of (b ?? []) as Array<{ target_task: { id: string; title: string; status_id: string | null } | null }>) {
          collect(row.target_task);
        }

        frontier = next;
        depth += 1;
      }

      return Array.from(visited.values()).sort((x, y) => x.depth - y.depth);
    },
  });
}
