import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Target, Plus, X, Hash, Percent, DollarSign, CheckSquare, ListChecks, UserPlus } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useGoalDetail, useUpdateGoal, useCreateTarget, useUpdateTarget, useDeleteTarget,
  useGoalMembers, useAddGoalMember, useRemoveGoalMember, type GoalTarget,
} from "@/hooks/useGoals";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const COLORS = ["#7C3AED", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#8B5CF6", "#F97316", "#14B8A6", "#6366F1", "#84CC16"];

const TYPE_ICON: Record<string, any> = {
  number: Hash, percentage: Percent, currency: DollarSign, true_false: CheckSquare, task_count: ListChecks,
};

function targetProgress(t: GoalTarget): number {
  if (t.target_type === "true_false") return t.current_value >= 1 ? 100 : 0;
  if (t.target_value === t.initial_value) return 0;
  const p = ((t.current_value - t.initial_value) / (t.target_value - t.initial_value)) * 100;
  return Math.max(0, Math.min(100, p));
}

function tone(p: number) {
  if (p >= 70) return "bg-emerald-500";
  if (p >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

export default function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();
  const { current } = useWorkspace();

  const { data: goal, isLoading } = useGoalDetail(goalId);
  const updateGoal = useUpdateGoal();
  const createTarget = useCreateTarget(goalId!);
  const updateTarget = useUpdateTarget();
  const deleteTarget = useDeleteTarget();
  const { data: members = [] } = useGoalMembers(goalId);
  const addMember = useAddGoalMember(goalId!);
  const removeMember = useRemoveGoalMember();

  const [name, setName] = useState("");
  useEffect(() => { if (goal) setName(goal.name); }, [goal?.id]);

  const [showAddTarget, setShowAddTarget] = useState(false);
  const [tName, setTName] = useState("");
  const [tType, setTType] = useState<GoalTarget["target_type"]>("number");
  const [tInitial, setTInitial] = useState("0");
  const [tCurrent, setTCurrent] = useState("0");
  const [tTarget, setTTarget] = useState("100");
  const [tUnit, setTUnit] = useState("");
  const [tListId, setTListId] = useState<string>("");

  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [wsMembers, setWsMembers] = useState<{ id: string; display_name: string | null; avatar_url: string | null; email: string | null }[]>([]);

  useEffect(() => {
    if (!current) return;
    supabase.from("lists").select("id,name").eq("workspace_id", current.id).then(({ data }) => setLists(data ?? []));
    supabase.from("workspace_members").select("user_id").eq("workspace_id", current.id).then(async ({ data }) => {
      const ids = (data ?? []).map((m) => m.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url, email").in("id", ids);
      setWsMembers(profs ?? []);
    });
  }, [current?.id]);

  if (isLoading || !goal) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }

  const progress = goal.progress ?? 0;

  const handleAddTarget = async () => {
    if (!tName.trim() || !current) return;
    await createTarget.mutateAsync({
      workspace_id: current.id,
      name: tName.trim(),
      target_type: tType,
      initial_value: Number(tInitial) || 0,
      current_value: tType === "true_false" ? 0 : (Number(tCurrent) || 0),
      target_value: tType === "true_false" ? 1 : (Number(tTarget) || 100),
      unit: tUnit || null,
      list_id: tType === "task_count" ? (tListId || null) : null,
      task_filter: null,
    });
    setShowAddTarget(false);
    setTName(""); setTInitial("0"); setTCurrent("0"); setTTarget("100"); setTUnit(""); setTListId("");
    setTType("number");
  };

  const memberIds = new Set(members.map((m) => m.id));
  const candidateMembers = wsMembers.filter((m) => !memberIds.has(m.id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate("/goals")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Goals
      </Button>

      {/* Header */}
      <div className="flex items-start gap-6 flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: goal.color + "20", color: goal.color }}
            >
              <Target className="h-8 w-8" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto">
            <div className="flex gap-2 flex-wrap max-w-[220px]">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateGoal.mutate({ id: goal.id, color: c })}
                  className={`h-7 w-7 rounded-full border-2 ${goal.color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1 min-w-0 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== goal.name && name.trim() && updateGoal.mutate({ id: goal.id, name: name.trim() })}
            className="text-2xl font-bold border-none px-0 focus-visible:ring-0 h-auto bg-transparent"
          />
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {goal.owner && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={goal.owner.avatar_url ?? undefined} />
                  <AvatarFallback>{(goal.owner.display_name ?? "?")[0]}</AvatarFallback>
                </Avatar>
                <span>{goal.owner.display_name ?? "Owner"}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={goal.start_date ?? ""}
                onChange={(e) => updateGoal.mutate({ id: goal.id, start_date: e.target.value || null })}
                className="h-8 w-40"
              />
              <span>→</span>
              <Input
                type="date"
                value={goal.due_date ?? ""}
                onChange={(e) => updateGoal.mutate({ id: goal.id, due_date: e.target.value || null })}
                className="h-8 w-40"
              />
            </div>
          </div>
        </div>

        {/* Progress circle */}
        <div className="flex flex-col items-center">
          <div className="relative h-24 w-24">
            <svg viewBox="0 0 100 100" className="-rotate-90 h-24 w-24">
              <circle cx="50" cy="50" r="44" stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
              <circle
                cx="50" cy="50" r="44" stroke={goal.color} strokeWidth="10" fill="none"
                strokeDasharray={`${(progress / 100) * 276.46} 276.46`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
              {progress.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Targets */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Targets</h2>
          <Button size="sm" onClick={() => setShowAddTarget(true)}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar target
          </Button>
        </div>

        {goal.targets?.length === 0 && !showAddTarget && (
          <p className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
            Nenhum target. Adicione o primeiro para medir progresso.
          </p>
        )}

        <div className="space-y-2">
          {goal.targets?.map((t) => {
            const Icon = TYPE_ICON[t.target_type];
            const p = targetProgress(t);
            return (
              <div key={t.id} className="border rounded-lg p-4 bg-card">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{t.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {t.target_type === "true_false" ? (
                          <Switch
                            checked={t.current_value >= 1}
                            onCheckedChange={(checked) =>
                              updateTarget.mutate({ id: t.id, goal_id: goal.id, current_value: checked ? 1 : 0 })
                            }
                          />
                        ) : t.target_type === "task_count" ? (
                          <>
                            <span className="text-sm font-mono">{t.current_value}/{t.target_value}</span>
                            {t.list_id && (
                              <Link to={`/list/${t.list_id}`} className="text-xs text-primary hover:underline">
                                Ver tarefas
                              </Link>
                            )}
                          </>
                        ) : (
                          <InlineNumberEdit
                            value={t.current_value}
                            target={t.target_value}
                            unit={t.unit}
                            onSave={(v) => updateTarget.mutate({ id: t.id, goal_id: goal.id, current_value: v })}
                          />
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => deleteTarget.mutate({ id: t.id, goal_id: goal.id })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full transition-all ${tone(p)}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {showAddTarget && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={tName} onChange={(e) => setTName(e.target.value)} autoFocus />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={tType} onValueChange={(v) => setTType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="percentage">Porcentagem</SelectItem>
                    <SelectItem value="currency">Moeda</SelectItem>
                    <SelectItem value="true_false">Sim/Não</SelectItem>
                    <SelectItem value="task_count">Contagem de tarefas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {tType === "task_count" ? (
              <div>
                <Label>Lista</Label>
                <Select value={tListId} onValueChange={setTListId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma lista" /></SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : tType !== "true_false" ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Inicial</Label>
                  <Input type="number" value={tInitial} onChange={(e) => setTInitial(e.target.value)} />
                </div>
                <div>
                  <Label>Atual</Label>
                  <Input type="number" value={tCurrent} onChange={(e) => setTCurrent(e.target.value)} />
                </div>
                <div>
                  <Label>Meta</Label>
                  <Input type="number" value={tTarget} onChange={(e) => setTTarget(e.target.value)} />
                </div>
                {(tType === "number" || tType === "currency") && (
                  <div className="col-span-3">
                    <Label>Unidade</Label>
                    <Input value={tUnit} onChange={(e) => setTUnit(e.target.value)} placeholder="ex: usuários, R$" />
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAddTarget(false)}>Cancelar</Button>
              <Button onClick={handleAddTarget} disabled={!tName.trim()}>Adicionar</Button>
            </div>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Membros</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                if (confirm(`Remover ${m.display_name ?? m.email}?`)) {
                  removeMember.mutate({ goal_id: goal.id, user_id: m.id });
                }
              }}
              className="flex items-center gap-2 border rounded-full pl-1 pr-3 py-1 hover:bg-muted transition"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={m.avatar_url ?? undefined} />
                <AvatarFallback>{(m.display_name ?? "?")[0]}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{m.display_name ?? m.email}</span>
            </button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline"><UserPlus className="h-3.5 w-3.5 mr-2" /> Adicionar membro</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              {candidateMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">Nenhum membro disponível</p>
              ) : candidateMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMember.mutate(m.id)}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={m.avatar_url ?? undefined} />
                    <AvatarFallback>{(m.display_name ?? "?")[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{m.display_name ?? m.email}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </section>
    </div>
  );
}

function InlineNumberEdit({
  value, target, unit, onSave,
}: { value: number; target: number; unit: string | null; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  useEffect(() => setVal(String(value)), [value]);

  if (editing) {
    return (
      <Input
        type="number"
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); const n = Number(val); if (!isNaN(n) && n !== value) onSave(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 w-24 text-sm"
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="text-sm font-mono hover:bg-muted rounded px-2 py-0.5">
      {value}{unit ? ` ${unit}` : ""} / {target}{unit ? ` ${unit}` : ""}
    </button>
  );
}
