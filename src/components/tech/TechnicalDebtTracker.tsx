import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  useTechnicalDebt, useCreateTechDebt, useResolveTechDebt, useDeleteTechDebt,
  type DebtCategory, type DebtSeverity, type TechnicalDebtItem,
} from "@/hooks/useTechQuality";

const CATEGORIES: { value: DebtCategory; label: string }[] = [
  { value: "refactoring", label: "Refatoração" },
  { value: "performance", label: "Performance" },
  { value: "security", label: "Segurança" },
  { value: "testing", label: "Testes" },
  { value: "documentation", label: "Documentação" },
];

const SEVERITIES: { value: DebtSeverity; label: string; tone: string }[] = [
  { value: "low", label: "Baixa", tone: "bg-muted text-muted-foreground" },
  { value: "medium", label: "Média", tone: "bg-amber-500/20 text-amber-600" },
  { value: "high", label: "Alta", tone: "bg-orange-500/20 text-orange-600" },
  { value: "critical", label: "Crítica", tone: "bg-red-500/20 text-red-600" },
];

interface Props { teamId?: string | null; canEdit: boolean }

export function TechnicalDebtTracker({ teamId, canEdit }: Props) {
  const { data: items = [] } = useTechnicalDebt(teamId);
  const resolve = useResolveTechDebt();
  const del = useDeleteTechDebt();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [showResolved, setShowResolved] = useState(false);

  const filtered = useMemo(() => items.filter((i) => {
    if (!showResolved && i.is_resolved) return false;
    if (filterCat !== "all" && i.category !== filterCat) return false;
    return true;
  }), [items, filterCat, showResolved]);

  const totals = useMemo(() => {
    const active = items.filter((i) => !i.is_resolved);
    const totalPoints = active.reduce((s, i) => s + (i.estimated_points ?? 0), 0);
    const critical = active.filter((i) => i.severity === "critical").length;
    const byCat = active.reduce<Record<string, number>>((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {});
    return { totalPoints, critical, byCat, count: active.length };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total ativo</p>
          <p className="text-2xl font-bold">{totals.count}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Pontos estimados</p>
          <p className="text-2xl font-bold">{totals.totalPoints}pt</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Críticos</p>
          <p className="text-2xl font-bold text-destructive">{totals.critical}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Categorias</p>
          <p className="text-sm font-medium">{Object.entries(totals.byCat).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Débito Técnico</CardTitle>
              <CardDescription>Rastreie e priorize melhorias internas.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setShowResolved((v) => !v)}>
                {showResolved ? "Ocultar resolvidos" : "Mostrar resolvidos"}
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Novo item
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Impacto</TableHead>
                  <TableHead>Pontos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((it) => <DebtRow key={it.id} item={it} canEdit={canEdit} onResolve={() => resolve.mutate({ id: it.id })} onDelete={() => del.mutate(it.id)} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateDebtDialog open={createOpen} onOpenChange={setCreateOpen} teamId={teamId ?? null} />
    </div>
  );
}

function DebtRow({ item, canEdit, onResolve, onDelete }: { item: TechnicalDebtItem; canEdit: boolean; onResolve: () => void; onDelete: () => void }) {
  const sev = SEVERITIES.find((s) => s.value === item.severity)!;
  return (
    <TableRow className={item.is_resolved ? "opacity-50" : ""}>
      <TableCell>
        <div className="font-medium">{item.title}</div>
        {item.description && <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>}
      </TableCell>
      <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${sev.tone}`}>{sev.label}</span></TableCell>
      <TableCell>{item.impact_score ?? "—"}</TableCell>
      <TableCell>{item.estimated_points ?? "—"}</TableCell>
      <TableCell className="text-right">
        {canEdit && !item.is_resolved && (
          <Button size="sm" variant="ghost" onClick={onResolve} title="Resolver">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function CreateDebtDialog({ open, onOpenChange, teamId }: { open: boolean; onOpenChange: (o: boolean) => void; teamId: string | null }) {
  const create = useCreateTechDebt();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DebtCategory>("refactoring");
  const [severity, setSeverity] = useState<DebtSeverity>("medium");
  const [points, setPoints] = useState("");
  const [impact, setImpact] = useState("");

  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({
      title, description, category, severity,
      team_id: teamId,
      estimated_points: points ? Number(points) : null,
      impact_score: impact ? Number(impact) : null,
    });
    setTitle(""); setDescription(""); setPoints(""); setImpact("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo item de débito técnico</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Refatorar módulo de autenticação" />
          </div>
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Categoria</label>
              <Select value={category} onValueChange={(v) => setCategory(v as DebtCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Severidade</label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as DebtSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pontos</label>
              <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Impacto (1-10)</label>
              <Input type="number" min={1} max={10} value={impact} onChange={(e) => setImpact(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!title.trim()}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
