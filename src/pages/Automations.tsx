import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Zap, History, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Trigger = "task_created" | "status_changed" | "task_completed" | "assignee_changed";
type ActionType = "set_status" | "set_assignee" | "set_priority" | "add_tag" | "set_due_date";
type Priority = "low" | "medium" | "high" | "urgent";

interface ActionItem {
  type: ActionType;
  status_id?: string;
  assignee_id?: string;
  priority?: Priority;
  tag?: string;
  days_from_now?: number;
}

interface Automation {
  id: string;
  workspace_id: string;
  list_id: string | null;
  name: string;
  is_active: boolean;
  trigger: Trigger;
  trigger_config: { to_status_id?: string };
  actions: ActionItem[];
  created_at: string;
}

interface List { id: string; name: string; }
interface Status { id: string; name: string; list_id: string; color: string | null; }
interface Member { user_id: string; profile: { display_name: string | null; email: string | null } | null; }
interface Run {
  id: string; automation_id: string; status: string;
  error_message: string | null; created_at: string; applied_actions: any;
}

const TRIGGER_LABELS: Record<Trigger, string> = {
  task_created: "Quando uma tarefa for criada",
  status_changed: "Quando o status mudar",
  task_completed: "Quando a tarefa for concluída",
  assignee_changed: "Quando o responsável mudar",
};

const ACTION_LABELS: Record<ActionType, string> = {
  set_status: "Mover para status",
  set_assignee: "Atribuir a",
  set_priority: "Definir prioridade",
  add_tag: "Adicionar tag",
  set_due_date: "Definir vencimento (dias)",
};

export default function Automations() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const [a, l, s, m, r, role] = await Promise.all([
      supabase.from("automations").select("*").eq("workspace_id", current.id).order("created_at", { ascending: false }),
      supabase.from("lists").select("id,name").eq("workspace_id", current.id).order("name"),
      supabase.from("status_columns").select("id,name,list_id,color").eq("workspace_id", current.id),
      supabase.from("workspace_members").select("user_id, profile:profiles(display_name,email)").eq("workspace_id", current.id),
      supabase.from("automation_runs").select("*").eq("workspace_id", current.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("workspace_members").select("role").eq("workspace_id", current.id).eq("user_id", user?.id ?? "").maybeSingle(),
    ]);
    setAutomations((a.data ?? []) as any);
    setLists(l.data ?? []);
    setStatuses(s.data ?? []);
    setMembers((m.data ?? []) as any);
    setRuns((r.data ?? []) as any);
    setIsAdmin(role.data?.role === "admin");
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  const openNew = () => {
    setEditing({
      id: "", workspace_id: current!.id, list_id: null, name: "",
      is_active: true, trigger: "task_created", trigger_config: {}, actions: [],
      created_at: "",
    });
    setOpen(true);
  };

  const openEdit = (a: Automation) => {
    setEditing({ ...a, actions: [...a.actions], trigger_config: { ...a.trigger_config } });
    setOpen(true);
  };

  const save = async () => {
    if (!editing || !current) return;
    if (!editing.name.trim()) return toast.error("Nome obrigatório");
    if (editing.actions.length === 0) return toast.error("Adicione ao menos uma ação");

    const payload = {
      workspace_id: current.id,
      list_id: editing.list_id,
      name: editing.name.trim(),
      is_active: editing.is_active,
      trigger: editing.trigger,
      trigger_config: editing.trigger_config,
      actions: editing.actions as any,
    };

    const { error } = editing.id
      ? await supabase.from("automations").update(payload).eq("id", editing.id)
      : await supabase.from("automations").insert({ ...payload, created_by: user?.id });

    if (error) return toast.error(error.message);
    toast.success("Automação salva");
    setOpen(false);
    setEditing(null);
    load();
  };

  const toggleActive = async (a: Automation) => {
    const { error } = await supabase.from("automations").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (a: Automation) => {
    if (!confirm(`Remover "${a.name}"?`)) return;
    const { error } = await supabase.from("automations").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    load();
  };

  const scopedStatuses = useMemo(() => {
    if (!editing) return [];
    return editing.list_id ? statuses.filter((s) => s.list_id === editing.list_id) : statuses;
  }, [editing, statuses]);

  const runsByAuto = useMemo(() => {
    const m = new Map<string, Run[]>();
    runs.forEach((r) => {
      const arr = m.get(r.automation_id) ?? [];
      arr.push(r); m.set(r.automation_id, arr);
    });
    return m;
  }, [runs]);

  if (!current) return null;

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Automações
          </h1>
          <p className="text-sm text-muted-foreground">
            Regras "quando isso acontecer, faça aquilo" para suas tarefas.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova automação</Button>
        )}
      </div>

      {!isAdmin && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Apenas admins podem criar ou editar automações.
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : automations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma automação ainda. {isAdmin && "Crie a primeira para automatizar fluxos."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const list = lists.find((l) => l.id === a.list_id);
            const lastRuns = runsByAuto.get(a.id)?.slice(0, 3) ?? [];
            return (
              <Card key={a.id} className={a.is_active ? "" : "opacity-60"}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {a.name}
                      {!a.is_active && <Badge variant="secondary">Pausada</Badge>}
                      {list && <Badge variant="outline">{list.name}</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {TRIGGER_LABELS[a.trigger]} → {a.actions.length} ação(ões)
                    </CardDescription>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                      <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>Editar</Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(a)} aria-label="Remover">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {a.actions.map((act, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {ACTION_LABELS[act.type]}
                      </Badge>
                    ))}
                  </div>
                  {lastRuns.length > 0 && (
                    <div className="border-t pt-3 mt-2">
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                        <History className="h-3 w-3" /> Últimas execuções
                      </div>
                      <div className="space-y-1">
                        {lastRuns.map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-xs">
                            {r.status === "success"
                              ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                              : <AlertCircle className="h-3 w-3 text-destructive" />}
                            <span className="text-muted-foreground">
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                            </span>
                            {r.error_message && <span className="text-destructive truncate">{r.error_message}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar automação" : "Nova automação"}</DialogTitle>
            <DialogDescription>Configure quando disparar e o que executar.</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Notificar quando tarefa for concluída"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Lista (opcional)</Label>
                  <Select
                    value={editing.list_id ?? "all"}
                    onValueChange={(v) => setEditing({ ...editing, list_id: v === "all" ? null : v, trigger_config: {} })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as listas</SelectItem>
                      {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Switch
                    checked={editing.is_active}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                  <Label>Ativa</Label>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="font-medium text-sm">Quando…</div>
                <Select
                  value={editing.trigger}
                  onValueChange={(v: Trigger) => setEditing({ ...editing, trigger: v, trigger_config: {} })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRIGGER_LABELS) as Trigger[]).map((t) => (
                      <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {editing.trigger === "status_changed" && (
                  <div>
                    <Label className="text-xs">Para o status (opcional)</Label>
                    <Select
                      value={editing.trigger_config.to_status_id ?? "any"}
                      onValueChange={(v) => setEditing({
                        ...editing,
                        trigger_config: v === "any" ? {} : { to_status_id: v },
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Qualquer status</SelectItem>
                        {scopedStatuses.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">Então…</div>
                  <Button size="sm" variant="outline" onClick={() =>
                    setEditing({ ...editing, actions: [...editing.actions, { type: "set_status" }] })
                  }>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Ação
                  </Button>
                </div>

                {editing.actions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma ação. Adicione ao menos uma.</p>
                )}

                {editing.actions.map((act, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded border bg-background p-2">
                    <div className="flex-1 grid gap-2">
                      <Select
                        value={act.type}
                        onValueChange={(v: ActionType) => {
                          const next = [...editing.actions];
                          next[idx] = { type: v };
                          setEditing({ ...editing, actions: next });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
                            <SelectItem key={t} value={t}>{ACTION_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {act.type === "set_status" && (
                        <Select
                          value={act.status_id ?? ""}
                          onValueChange={(v) => {
                            const next = [...editing.actions];
                            next[idx] = { ...act, status_id: v };
                            setEditing({ ...editing, actions: next });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger>
                          <SelectContent>
                            {scopedStatuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {act.type === "set_assignee" && (
                        <Select
                          value={act.assignee_id ?? ""}
                          onValueChange={(v) => {
                            const next = [...editing.actions];
                            next[idx] = { ...act, assignee_id: v };
                            setEditing({ ...editing, actions: next });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione um membro" /></SelectTrigger>
                          <SelectContent>
                            {members.map((mem) => (
                              <SelectItem key={mem.user_id} value={mem.user_id}>
                                {mem.profile?.display_name ?? mem.profile?.email ?? mem.user_id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {act.type === "set_priority" && (
                        <Select
                          value={act.priority ?? ""}
                          onValueChange={(v: Priority) => {
                            const next = [...editing.actions];
                            next[idx] = { ...act, priority: v };
                            setEditing({ ...editing, actions: next });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Baixa</SelectItem>
                            <SelectItem value="medium">Média</SelectItem>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="urgent">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      )}

                      {act.type === "add_tag" && (
                        <Input
                          placeholder="nome-da-tag"
                          value={act.tag ?? ""}
                          onChange={(e) => {
                            const next = [...editing.actions];
                            next[idx] = { ...act, tag: e.target.value };
                            setEditing({ ...editing, actions: next });
                          }}
                        />
                      )}

                      {act.type === "set_due_date" && (
                        <Input
                          type="number"
                          min={0}
                          placeholder="Dias a partir de agora"
                          value={act.days_from_now ?? ""}
                          onChange={(e) => {
                            const next = [...editing.actions];
                            next[idx] = { ...act, days_from_now: Number(e.target.value) };
                            setEditing({ ...editing, actions: next });
                          }}
                        />
                      )}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setEditing({
                        ...editing,
                        actions: editing.actions.filter((_, i) => i !== idx),
                      })}
                      aria-label="Remover ação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
