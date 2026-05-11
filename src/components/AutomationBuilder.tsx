import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, X, ArrowRight, ArrowLeft, GripVertical } from "lucide-react";
import {
  type Automation,
  type AutomationAction,
  type AutomationActionType,
  type AutomationCondition,
  type AutomationTrigger,
  TRIGGER_LABELS,
  TRIGGER_ICONS,
  ACTION_LABELS,
  useCreateAutomation,
  useUpdateAutomation,
  describeAutomation,
} from "@/hooks/useAutomations";

interface ListLite { id: string; name: string; space_id?: string | null }
interface SpaceLite { id: string; name: string }
interface StatusLite { id: string; name: string; list_id: string; color: string | null }
interface MemberLite { user_id: string; profile: { display_name: string | null; email: string | null } | null }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  initial?: Automation | null;
  lists: ListLite[];
  spaces: SpaceLite[];
  statuses: StatusLite[];
  members: MemberLite[];
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;

function emptyAutomation(workspaceId: string): Omit<Automation, "id" | "run_count" | "last_run_at" | "created_at" | "created_by"> {
  return {
    workspace_id: workspaceId,
    list_id: null,
    name: "",
    is_active: true,
    trigger: "task_created",
    trigger_config: {},
    conditions: [],
    actions: [],
  };
}

export default function AutomationBuilder({
  open, onOpenChange, workspaceId, initial, lists, spaces, statuses, members,
}: Props) {
  const create = useCreateAutomation();
  const update = useUpdateAutomation();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(emptyAutomation(workspaceId));
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setNameTouched(!!initial?.name);
      setDraft(initial
        ? {
            workspace_id: initial.workspace_id,
            list_id: initial.list_id,
            name: initial.name,
            is_active: initial.is_active,
            trigger: initial.trigger,
            trigger_config: initial.trigger_config ?? {},
            conditions: initial.conditions ?? [],
            actions: initial.actions ?? [],
          }
        : emptyAutomation(workspaceId));
    }
  }, [open, initial, workspaceId]);

  const scopedStatuses = useMemo(
    () => (draft.list_id ? statuses.filter((s) => s.list_id === draft.list_id) : statuses),
    [draft.list_id, statuses],
  );

  const autoName = useMemo(() => describeAutomation({
    ...draft, id: "", run_count: 0, last_run_at: null, created_at: "", created_by: null,
  } as Automation), [draft]);

  useEffect(() => {
    if (!nameTouched) setDraft((d) => ({ ...d, name: autoName }));
  }, [autoName, nameTouched]);

  const updateAction = (i: number, patch: Partial<AutomationAction>) => {
    setDraft((d) => {
      const next = [...d.actions];
      next[i] = { ...next[i], ...patch };
      return { ...d, actions: next };
    });
  };
  const removeAction = (i: number) =>
    setDraft((d) => ({ ...d, actions: d.actions.filter((_, idx) => idx !== i) }));

  const moveAction = (from: number, to: number) =>
    setDraft((d) => {
      const next = [...d.actions];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...d, actions: next };
    });

  const addCondition = () =>
    setDraft((d) => ({ ...d, conditions: [...d.conditions, { field: "priority", op: "eq", value: "" }] }));
  const updateCondition = (i: number, patch: Partial<AutomationCondition>) =>
    setDraft((d) => {
      const next = [...d.conditions];
      next[i] = { ...next[i], ...patch } as AutomationCondition;
      return { ...d, conditions: next };
    });
  const removeCondition = (i: number) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, idx) => idx !== i) }));

  const canSave =
    draft.name.trim().length > 0 &&
    draft.actions.length > 0 &&
    draft.actions.every((a) => isActionValid(a));

  const handleSave = async () => {
    if (!canSave) return;
    if (initial?.id) {
      await update.mutateAsync({ id: initial.id, ...draft });
    } else {
      await create.mutateAsync(draft);
    }
    onOpenChange(false);
  };

  const triggers: AutomationTrigger[] = [
    "status_changed", "priority_changed", "assignee_changed",
    "due_date_approaching", "task_created", "task_completed", "comment_added",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar automação" : "Nova automação"}</DialogTitle>
          <div className="flex gap-2 pt-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className={cn(
                "flex-1 h-1 rounded-full transition-colors",
                step >= n ? "bg-primary" : "bg-muted",
              )} />
            ))}
          </div>
          <div className="text-sm text-muted-foreground pt-1">
            Etapa {step} de 3 — {step === 1 ? "Quando" : step === 2 ? "Se (condições)" : "Então (ações)"}
          </div>
        </DialogHeader>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Aplicar a</Label>
              <Select
                value={draft.list_id ?? "all"}
                onValueChange={(v) => setDraft({ ...draft, list_id: v === "all" ? null : v, trigger_config: {} })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo o workspace</SelectItem>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Escolha o gatilho</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {triggers.map((t) => (
                  <Card
                    key={t}
                    className={cn(
                      "p-3 cursor-pointer hover:border-primary transition-colors",
                      draft.trigger === t && "border-primary bg-primary/5",
                    )}
                    onClick={() => setDraft({ ...draft, trigger: t, trigger_config: {} })}
                  >
                    <div className="text-2xl">{TRIGGER_ICONS[t]}</div>
                    <div className="text-sm font-medium mt-1">{TRIGGER_LABELS[t]}</div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Trigger config */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              {draft.trigger === "status_changed" && (
                <div className="grid grid-cols-2 gap-3">
                  <StatusSelect
                    label="De"
                    statuses={scopedStatuses}
                    value={draft.trigger_config.from_status_id}
                    onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, from_status_id: v } })}
                  />
                  <StatusSelect
                    label="Para"
                    statuses={scopedStatuses}
                    value={draft.trigger_config.to_status_id}
                    onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, to_status_id: v } })}
                  />
                </div>
              )}
              {draft.trigger === "priority_changed" && (
                <div className="grid grid-cols-2 gap-3">
                  <PrioritySelect
                    label="De"
                    value={draft.trigger_config.from_priority}
                    onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, from_priority: v } })}
                  />
                  <PrioritySelect
                    label="Para"
                    value={draft.trigger_config.to_priority}
                    onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, to_priority: v } })}
                  />
                </div>
              )}
              {draft.trigger === "assignee_changed" && (
                <MemberSelect
                  label="Responsável (opcional)"
                  members={members}
                  value={draft.trigger_config.assignee_id}
                  onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, assignee_id: v } })}
                  allowAny
                />
              )}
              {draft.trigger === "due_date_approaching" && (
                <div>
                  <Label className="text-xs">Quantos dias antes?</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={draft.trigger_config.days_before ?? 3}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const clamped = Number.isFinite(raw) ? Math.min(30, Math.max(1, raw)) : 3;
                      setDraft({
                        ...draft,
                        trigger_config: { ...draft.trigger_config, days_before: clamped },
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Entre 1 e 30 dias (padrão: 3). Avaliado periodicamente em background.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Condições adicionais (todas precisam ser verdadeiras). Opcional.
            </p>
            {draft.conditions.map((c, i) => (
              <div key={i} className="space-y-2">
                {i > 0 && (
                  <div className="flex justify-center">
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      E
                    </span>
                  </div>
                )}
                <div className="flex gap-2 items-start rounded border p-2 bg-background">
                  <Select value={c.field} onValueChange={(v: any) => updateCondition(i, { field: v, value: "" })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Prioridade</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="assignee">Responsável</SelectItem>
                      <SelectItem value="list">Lista</SelectItem>
                      <SelectItem value="tag">Tag</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={c.op} onValueChange={(v: any) => updateCondition(i, { op: v })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {c.field === "tag" ? (
                        <>
                          <SelectItem value="contains">contém</SelectItem>
                          <SelectItem value="not_contains">não contém</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="eq">é</SelectItem>
                          <SelectItem value="neq">não é</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex-1">
                    <ConditionValueInput
                      field={c.field}
                      value={c.value}
                      onChange={(v) => updateCondition(i, { value: v })}
                      members={members}
                      statuses={scopedStatuses}
                      lists={lists}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeCondition(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addCondition}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar condição
            </Button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adicione uma ou mais ações. Elas serão executadas em ordem.
            </p>
            <div className="space-y-2">
              {draft.actions.map((a, i) => (
                <div key={i} className="flex gap-2 items-start rounded border p-3 bg-background">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      onClick={() => moveAction(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Mover acima"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <Badge variant="secondary" className="text-xs px-1.5">{i + 1}</Badge>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Select
                      value={a.type}
                      onValueChange={(v: AutomationActionType) => updateAction(i, { type: v, status_id: undefined, priority: undefined, assignee_id: undefined, list_id: undefined, body: undefined, title: undefined, tag: undefined, days_from_now: undefined })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ACTION_LABELS) as AutomationActionType[]).map((t) => (
                          <SelectItem key={t} value={t}>{ACTION_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <ActionConfig
                      action={a}
                      onChange={(patch) => updateAction(i, patch)}
                      statuses={scopedStatuses}
                      members={members}
                      lists={lists}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeAction(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() =>
              setDraft({ ...draft, actions: [...draft.actions, { type: "set_status" }] })
            }>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ação
            </Button>

            <div className="border-t pt-3">
              <Label>Nome da automação</Label>
              <Input
                value={draft.name}
                onChange={(e) => { setNameTouched(true); setDraft({ ...draft, name: e.target.value }); }}
                placeholder={autoName}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)}>
              Próximo <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={!canSave || create.isPending || update.isPending}>
              Salvar automação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isActionValid(a: AutomationAction): boolean {
  switch (a.type) {
    case "set_status": return !!a.status_id;
    case "set_priority": return !!a.priority;
    case "set_assignee": return !!a.assignee_id;
    case "unassign_user": return true;
    case "add_tag": return !!a.tag?.trim();
    case "set_due_date": return a.days_from_now != null && a.days_from_now >= 0;
    case "move_to_list": return !!a.list_id;
    case "create_subtask": return !!a.title?.trim();
    case "post_comment": return !!a.body?.trim();
    case "send_notification": return !!a.body?.trim();
    default: return false;
  }
}

function StatusSelect({ label, statuses, value, onChange }: {
  label: string; statuses: StatusLite[]; value?: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
        <SelectContent>
          {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function PrioritySelect({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function MemberSelect({ label, members, value, onChange, allowAny }: {
  label: string; members: MemberLite[]; value?: string; onChange: (v: string) => void; allowAny?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={allowAny ? "Qualquer" : "Selecione"} /></SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.profile?.display_name ?? m.profile?.email ?? m.user_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ConditionValueInput({ field, value, onChange, members, statuses, lists }: {
  field: AutomationCondition["field"]; value: string; onChange: (v: string) => void;
  members: MemberLite[]; statuses: StatusLite[]; lists: ListLite[];
}) {
  if (field === "priority") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field === "status") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field === "assignee") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.profile?.display_name ?? m.profile?.email ?? m.user_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field === "list") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="tag" />;
}

function ActionConfig({ action, onChange, statuses, members, lists }: {
  action: AutomationAction;
  onChange: (patch: Partial<AutomationAction>) => void;
  statuses: StatusLite[]; members: MemberLite[]; lists: ListLite[];
}) {
  switch (action.type) {
    case "set_status":
      return (
        <Select value={action.status_id ?? ""} onValueChange={(v) => onChange({ status_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "set_priority":
      return (
        <Select value={action.priority ?? ""} onValueChange={(v: any) => onChange({ priority: v })}>
          <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "set_assignee":
      return (
        <Select value={action.assignee_id ?? ""} onValueChange={(v) => onChange({ assignee_id: v })}>
          <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profile?.display_name ?? m.profile?.email ?? m.user_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "unassign_user":
      return <p className="text-xs text-muted-foreground">Remove o responsável atual da tarefa.</p>;
    case "add_tag":
      return <Input value={action.tag ?? ""} onChange={(e) => onChange({ tag: e.target.value })} placeholder="nome-da-tag" />;
    case "set_due_date":
      return (
        <Input
          type="number" min={0} placeholder="Dias a partir de agora"
          value={action.days_from_now ?? ""}
          onChange={(e) => onChange({ days_from_now: Number(e.target.value) })}
        />
      );
    case "move_to_list":
      return (
        <Select value={action.list_id ?? ""} onValueChange={(v) => onChange({ list_id: v })}>
          <SelectTrigger><SelectValue placeholder="Lista de destino" /></SelectTrigger>
          <SelectContent>
            {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "create_subtask":
      return <Input value={action.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título da subtarefa" />;
    case "post_comment":
      return <Textarea value={action.body ?? ""} onChange={(e) => onChange({ body: e.target.value })} placeholder="Texto do comentário" rows={2} />;
    case "send_notification":
      return (
        <div className="space-y-2">
          <Select value={action.user_id ?? ""} onValueChange={(v) => onChange({ user_id: v })}>
            <SelectTrigger><SelectValue placeholder="Destinatário (padrão: responsável)" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.display_name ?? m.profile?.email ?? m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea value={action.body ?? ""} onChange={(e) => onChange({ body: e.target.value })} placeholder="Mensagem da notificação" rows={2} />
        </div>
      );
    default:
      return null;
  }
}
