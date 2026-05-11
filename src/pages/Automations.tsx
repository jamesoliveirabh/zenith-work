import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Zap, History, AlertCircle, CheckCircle2, Pencil, Copy, Trash2, MinusCircle, RotateCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import AutomationBuilder from "@/components/AutomationBuilder";
import {
  type Automation,
  describeAutomation,
  useAutomations,
  useAutomationRuns,
  useDeleteAutomation,
  useDuplicateAutomation,
  useToggleAutomation,
} from "@/hooks/useAutomations";

type TemplateCategory = "notificações" | "organização";

type TemplateSeed = {
  name: string;
  description: string;
  category: TemplateCategory;
  trigger: Automation["trigger"];
  trigger_config?: Record<string, unknown>;
  conditions?: Automation["conditions"];
  actions: Automation["actions"];
};

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  "notificações": "Notificações",
  "organização": "Organização",
};

const TEMPLATES: TemplateSeed[] = [
  {
    name: "Notificar responsável quando atribuído",
    description: "Avisa quem foi designado assim que a tarefa muda de responsável.",
    category: "notificações",
    trigger: "assignee_changed",
    actions: [{ type: "send_notification" } as any],
  },
  {
    name: "Lembrete 3 dias antes do prazo",
    description: "Notifica o responsável 3 dias antes do vencimento.",
    category: "notificações",
    trigger: "due_date_approaching",
    trigger_config: { days_before: 3 },
    actions: [{ type: "send_notification" } as any],
  },
  {
    name: "Comentar quando concluída",
    description: "Posta um comentário automático quando a tarefa é finalizada.",
    category: "notificações",
    trigger: "task_completed",
    actions: [{ type: "post_comment", body: "✅ Tarefa concluída automaticamente." } as any],
  },
  {
    name: "Marcar urgente quando virar 'Em revisão'",
    description: "Eleva a prioridade ao mover para um status específico.",
    category: "organização",
    trigger: "status_changed",
    actions: [{ type: "set_priority", priority: "urgent" } as any],
  },
  {
    name: "Adicionar tag 'novo' ao criar tarefa",
    description: "Marca toda tarefa recém-criada com uma tag de triagem.",
    category: "organização",
    trigger: "task_created",
    actions: [{ type: "add_tag", tag: "novo" } as any],
  },
  {
    name: "Definir prazo de 7 dias ao criar",
    description: "Atribui automaticamente uma data de vencimento para tarefas novas.",
    category: "organização",
    trigger: "task_created",
    actions: [{ type: "set_due_date", days_from_now: 7 } as any],
  },
  {
    name: "Marcar urgente quando próximo do prazo",
    description: "Eleva a prioridade para urgente 2 dias antes do vencimento.",
    category: "organização",
    trigger: "due_date_approaching",
    trigger_config: { days_before: 2 },
    actions: [{ type: "set_priority", priority: "urgent" } as any],
  },
  {
    name: "Notificar responsável quando houver novo comentário",
    description: "Avisa o responsável da tarefa sempre que alguém comentar nela.",
    category: "notificações",
    trigger: "comment_added",
    actions: [{ type: "send_notification" } as any],
  },
];

export default function Automations() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const workspaceId = current?.id;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  const { data: automations = [], isLoading } = useAutomations(workspaceId);
  const { data: runs = [] } = useAutomationRuns(
    workspaceId,
    historyFilter === "all" ? undefined : historyFilter,
  );
  const toggle = useToggleAutomation();
  const remove = useDeleteAutomation();
  const duplicate = useDuplicateAutomation();

  const supportData = useQuery({
    queryKey: ["automations-support", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const [l, sp, st, m, role] = await Promise.all([
        supabase.from("lists").select("id,name,space_id").eq("workspace_id", workspaceId!).order("name"),
        supabase.from("spaces").select("id,name").eq("workspace_id", workspaceId!).order("name"),
        supabase.from("status_columns").select("id,name,list_id,color").eq("workspace_id", workspaceId!),
        supabase.from("workspace_members").select("user_id, profile:profiles(display_name,email)").eq("workspace_id", workspaceId!),
        supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId!).eq("user_id", user?.id ?? "").maybeSingle(),
      ]);
      return {
        lists: l.data ?? [],
        spaces: sp.data ?? [],
        statuses: st.data ?? [],
        members: (m.data ?? []) as any,
        isAdmin: role.data?.role === "admin",
      };
    },
  });

  const support = supportData.data;
  const lists = support?.lists ?? [];
  const isAdmin = support?.isAdmin ?? false;

  const runsByAuto = useMemo(() => {
    const map = new Map<string, typeof runs>();
    runs.forEach((r) => {
      const arr = map.get(r.automation_id) ?? [];
      arr.push(r);
      map.set(r.automation_id, arr);
    });
    return map;
  }, [runs]);

  const automationName = (id: string) =>
    automations.find((a) => a.id === id)?.name ?? "—";
  const taskTitleById = useQuery({
    queryKey: ["automation-task-titles", runs.map((r) => r.task_id).filter(Boolean).join(",")],
    enabled: runs.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(runs.map((r) => r.task_id).filter(Boolean))) as string[];
      if (ids.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("tasks").select("id,title").in("id", ids);
      const m: Record<string, string> = {};
      (data ?? []).forEach((t: any) => { m[t.id] = t.title; });
      return m;
    },
  });

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (a: Automation) => { setEditing(a); setOpen(true); };
  const openTemplate = (tpl: TemplateSeed) => {
    if (!workspaceId) return;
    setEditing({
      id: "",
      workspace_id: workspaceId,
      list_id: null,
      name: tpl.name,
      is_active: true,
      trigger: tpl.trigger,
      trigger_config: tpl.trigger_config ?? {},
      conditions: tpl.conditions ?? [],
      actions: tpl.actions,
      run_count: 0,
      last_run_at: null,
      created_at: "",
      created_by: null,
    } as unknown as Automation);
    setOpen(true);
  };

  const handleDelete = async (a: Automation) => {
    if (!confirm(`Remover "${a.name}"?`)) return;
    await remove.mutateAsync({ id: a.id, workspace_id: a.workspace_id, is_active: a.is_active });
  };

  if (!current) return null;

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Automações
          </h1>
          <p className="text-sm text-muted-foreground">
            "Quando isso acontecer → faça aquilo". Automatize fluxos no seu workspace.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Nova automação
          </Button>
        )}
      </div>

      {!isAdmin && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Apenas admins podem criar ou editar automações.
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Modelos prontos</CardTitle>
            <CardDescription className="text-xs">
              Comece com uma base — você pode ajustar tudo antes de salvar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((cat) => {
              const items = TEMPLATES.filter((t) => t.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABEL[cat]}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((tpl) => (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => openTemplate(tpl)}
                        className="text-left rounded-md border bg-background p-3 hover:border-primary hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                          {tpl.name}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {tpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="rules">Regras ({automations.length})</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-3 mt-4">
          {isLoading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : automations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma automação ainda. {isAdmin && "Crie a primeira para automatizar fluxos."}
              </CardContent>
            </Card>
          ) : (
            automations.map((a) => {
              const list = lists.find((l) => l.id === a.list_id);
              const lastRun = runsByAuto.get(a.id)?.[0];
              return (
                <Card key={a.id} className={a.is_active ? "" : "opacity-60"}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        {a.name}
                        {!a.is_active && <Badge variant="secondary">Pausada</Badge>}
                        {list ? <Badge variant="outline">{list.name}</Badge> : <Badge variant="outline">Workspace</Badge>}
                      </CardTitle>
                      <CardDescription className="mt-1">{describeAutomation(a)}</CardDescription>
                      <div className="text-xs text-muted-foreground mt-2">
                        Executada {a.run_count} {a.run_count === 1 ? "vez" : "vezes"}
                        {a.last_run_at && (
                          <> · Última {formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true, locale: ptBR })}</>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={a.is_active}
                          onCheckedChange={(v) => toggle.mutate({ id: a.id, is_active: v, workspace_id: a.workspace_id })}
                        />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => duplicate.mutate(a)} aria-label="Duplicar">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(a)} aria-label="Remover">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  {lastRun && (
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
                        {runIcon(lastRun.status)}
                        <span>
                          Última execução: {formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {lastRun.error_message && (
                          <span className="text-destructive truncate">{lastRun.error_message}</span>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-4">
          <div className="flex items-center gap-2">
            <Select value={historyFilter} onValueChange={setHistoryFilter}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as automações</SelectItem>
                {automations.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              {runs.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma execução ainda.</div>
              ) : (
                <div className="divide-y">
                  {runs.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                      {runIcon(r.status)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{automationName(r.automation_id)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.task_id ? (taskTitleById.data?.[r.task_id] ?? "Tarefa removida") : "—"}
                          {r.error_message && <span className="text-destructive ml-2">{r.error_message}</span>}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {workspaceId && support && (
        <AutomationBuilder
          open={open}
          onOpenChange={setOpen}
          workspaceId={workspaceId}
          initial={editing}
          lists={support.lists as any}
          spaces={support.spaces as any}
          statuses={support.statuses as any}
          members={support.members as any}
        />
      )}
    </div>
  );
}

function runIcon(status: string) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
}
