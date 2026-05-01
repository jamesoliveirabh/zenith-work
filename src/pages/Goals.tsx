import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, Plus, Archive, Copy, Trash2, MoreVertical, Pencil } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useGoals, useCreateGoal, useArchiveGoal, useDeleteGoal, useDuplicateGoal, type Goal, type GoalFilter } from "@/hooks/useGoals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = ["#7C3AED", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#8B5CF6", "#F97316", "#14B8A6", "#6366F1", "#84CC16"];

function progressTone(p: number) {
  if (p >= 70) return "bg-emerald-500";
  if (p >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function statusBadge(g: Goal) {
  const p = g.progress ?? 0;
  if (p >= 100) return { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (g.due_date) {
    const due = new Date(g.due_date).getTime();
    const now = Date.now();
    if (due < now) return { label: "Atrasado", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
    const daysLeft = (due - now) / 86400000;
    if (p < 40 && daysLeft < 14) return { label: "Em risco", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  }
  return { label: "No prazo", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" };
}

export default function Goals() {
  const { current } = useWorkspace();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<GoalFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [dueDate, setDueDate] = useState("");

  const { data: goals = [], isLoading } = useGoals(current?.id, filter);
  const createGoal = useCreateGoal();
  const archive = useArchiveGoal();
  const del = useDeleteGoal();
  const duplicate = useDuplicateGoal();

  const handleCreate = async () => {
    if (!current || !name.trim()) return;
    await createGoal.mutateAsync({
      workspace_id: current.id,
      name: name.trim(),
      color,
      due_date: dueDate || null,
    });
    setDialogOpen(false);
    setName("");
    setDueDate("");
    setColor(COLORS[0]);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Goals</h1>
            <p className="text-sm text-muted-foreground">Defina metas e acompanhe progresso mensurável</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Goal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Goal</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="ex: Q1 — Crescimento" />
              </div>
              <div>
                <Label>Cor</Label>
                <div className="flex gap-2 flex-wrap mt-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`h-7 w-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label>Data limite (opcional)</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!name.trim() || createGoal.isPending}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as GoalFilter)}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="mine">Meus Goals</TabsTrigger>
          <TabsTrigger value="archived">Arquivados</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 border rounded-lg border-dashed">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum goal ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {goals.map((g) => {
            const status = statusBadge(g);
            const progress = g.progress ?? 0;
            return (
              <div
                key={g.id}
                className="group border rounded-xl p-5 hover:shadow-md transition cursor-pointer bg-card"
                onClick={() => navigate(`/goals/${g.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: g.color + "20", color: g.color }}
                  >
                    <Target className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg truncate">{g.name}</h3>
                      <Badge variant="outline" className={status.cls}>{status.label}</Badge>
                    </div>
                    {(g.start_date || g.due_date) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {g.start_date ? new Date(g.start_date).toLocaleDateString() : "—"}
                        {" → "}
                        {g.due_date ? new Date(g.due_date).toLocaleDateString() : "—"}
                      </p>
                    )}

                    <div className="mt-4 space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-semibold">{progress.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full transition-all ${progressTone(progress)}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {!!g.targets?.length && (
                      <div className="mt-3 space-y-1">
                        {g.targets.slice(0, 3).map((t) => (
                          <div key={t.id} className="text-xs text-muted-foreground flex justify-between">
                            <span className="truncate">• {t.name}</span>
                            <span>{t.current_value}/{t.target_value}{t.unit ? ` ${t.unit}` : ""}</span>
                          </div>
                        ))}
                        {g.targets.length > 3 && (
                          <div className="text-xs text-primary">+{g.targets.length - 3} mais</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/goals/${g.id}`)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate.mutate(g)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archive.mutate({ id: g.id, archived: !g.is_archived, workspace_id: g.workspace_id })}>
                          <Archive className="h-4 w-4 mr-2" /> {g.is_archived ? "Desarquivar" : "Arquivar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => {
                          if (confirm("Deletar este goal?")) del.mutate({ id: g.id, workspace_id: g.workspace_id, is_archived: g.is_archived });
                        }}>
                          <Trash2 className="h-4 w-4 mr-2" /> Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
