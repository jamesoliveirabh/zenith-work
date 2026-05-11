import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { assertEntitlement, decrementUsage, EntitlementBlockedError } from "@/lib/billing/enforcement";
import { useEntitlementGuard } from "@/components/billing/EntitlementGuardProvider";

export type AutomationTrigger =
  | "task_created"
  | "status_changed"
  | "priority_changed"
  | "task_completed"
  | "assignee_changed"
  | "due_date_approaching"
  | "comment_added";

export type AutomationActionType =
  | "set_status"
  | "set_priority"
  | "set_assignee"
  | "unassign_user"
  | "add_tag"
  | "set_due_date"
  | "move_to_list"
  | "create_subtask"
  | "post_comment"
  | "send_notification"
  | "send_slack_message";

export interface AutomationCondition {
  field: "priority" | "status" | "assignee" | "list" | "tag";
  op: "eq" | "neq" | "contains" | "not_contains";
  value: string;
}

export interface AutomationAction {
  type: AutomationActionType;
  status_id?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  assignee_id?: string;
  tag?: string;
  days_from_now?: number;
  list_id?: string;
  title?: string;
  body?: string;
  user_id?: string;
}

export interface Automation {
  id: string;
  workspace_id: string;
  list_id: string | null;
  name: string;
  is_active: boolean;
  trigger: AutomationTrigger;
  trigger_config: Record<string, any>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  run_count: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  workspace_id: string;
  task_id: string | null;
  status: "success" | "failed" | "skipped";
  error_message: string | null;
  applied_actions: any;
  created_at: string;
}

export function useAutomations(workspaceId: string | undefined, listId?: string | null) {
  return useQuery({
    queryKey: ["automations", workspaceId, listId ?? "all"],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("automations")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (listId) q = q.or(`list_id.eq.${listId},list_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Automation[];
    },
  });
}

export function useAutomationRuns(workspaceId: string | undefined, automationId?: string) {
  return useQuery({
    queryKey: ["automation-runs", workspaceId, automationId ?? "all"],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("automation_runs")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (automationId) q = q.eq("automation_id", automationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRun[];
    },
  });
}

type SavePayload = Omit<Automation, "id" | "run_count" | "last_run_at" | "created_at" | "created_by">;

export function useCreateAutomation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const guard = useEntitlementGuard();
  return useMutation({
    mutationFn: async (a: SavePayload) => {
      // H5 enforcement: somente quando a automação é criada já ativa.
      if (a.is_active) {
        await assertEntitlement({
          workspaceId: a.workspace_id,
          featureKey: "automations",
          incrementBy: 1,
          action: "automation.create",
          commitUsage: true,
        });
      }
      const { data, error } = await supabase
        .from("automations")
        .insert({
          workspace_id: a.workspace_id,
          list_id: a.list_id,
          name: a.name,
          is_active: a.is_active,
          trigger: a.trigger as any,
          trigger_config: a.trigger_config,
          conditions: a.conditions as any,
          actions: a.actions as any,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) {
        if (a.is_active) await decrementUsage(a.workspace_id, "automations", 1);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação criada");
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

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Automation> & { id: string }) => {
      const { error } = await supabase
        .from("automations")
        .update({
          name: patch.name,
          list_id: patch.list_id,
          is_active: patch.is_active,
          trigger: patch.trigger as any,
          trigger_config: patch.trigger_config,
          conditions: patch.conditions as any,
          actions: patch.actions as any,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  const guard = useEntitlementGuard();
  return useMutation({
    mutationFn: async ({ id, is_active, workspace_id }: { id: string; is_active: boolean; workspace_id?: string }) => {
      if (is_active && workspace_id) {
        await assertEntitlement({
          workspaceId: workspace_id,
          featureKey: "automations",
          incrementBy: 1,
          action: "automation.activate",
          commitUsage: true,
        });
      }
      const { error } = await supabase.from("automations").update({ is_active }).eq("id", id);
      if (error) {
        if (is_active && workspace_id) await decrementUsage(workspace_id, "automations", 1);
        throw error;
      }
      if (!is_active && workspace_id) {
        await decrementUsage(workspace_id, "automations", 1);
      }
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ["automations"] });
      const prev = qc.getQueriesData<Automation[]>({ queryKey: ["automations"] });
      prev.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData(key, data.map((a) => (a.id === id ? { ...a, is_active } : a)));
      });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      if (e instanceof EntitlementBlockedError) {
        guard.handleError(e);
        return;
      }
      toast.error("Falha ao alternar automação");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; workspace_id?: string; is_active?: boolean }) => {
      const { error } = await supabase.from("automations").delete().eq("id", a.id);
      if (error) throw error;
      if (a.is_active && a.workspace_id) {
        await decrementUsage(a.workspace_id, "automations", 1);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação removida");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDuplicateAutomation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (a: Automation) => {
      const { error } = await supabase.from("automations").insert({
        workspace_id: a.workspace_id,
        list_id: a.list_id,
        name: `${a.name} (cópia)`,
        is_active: false,
        trigger: a.trigger as any,
        trigger_config: a.trigger_config,
        conditions: a.conditions as any,
        actions: a.actions as any,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação duplicada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  task_created: "Tarefa criada",
  status_changed: "Status mudou",
  priority_changed: "Prioridade mudou",
  task_completed: "Tarefa concluída",
  assignee_changed: "Responsável atribuído",
  due_date_approaching: "Vencimento se aproximando",
  comment_added: "Comentário adicionado",
};

export const TRIGGER_ICONS: Record<AutomationTrigger, string> = {
  task_created: "✨",
  status_changed: "🔄",
  priority_changed: "⚡",
  task_completed: "✅",
  assignee_changed: "👤",
  due_date_approaching: "📅",
  comment_added: "💬",
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  set_status: "Mudar status",
  set_priority: "Mudar prioridade",
  set_assignee: "Atribuir responsável",
  unassign_user: "Remover responsável",
  add_tag: "Adicionar tag",
  set_due_date: "Definir vencimento",
  move_to_list: "Mover para lista",
  create_subtask: "Criar subtarefa",
  post_comment: "Postar comentário",
  send_notification: "Enviar notificação",
};

export function describeAutomation(a: Automation): string {
  const trig = TRIGGER_LABELS[a.trigger] ?? a.trigger;
  const acts = (a.actions ?? []).map((act) => ACTION_LABELS[act.type] ?? act.type).join(", ");
  return `Quando ${trig.toLowerCase()} → ${acts || "sem ações"}`;
}
