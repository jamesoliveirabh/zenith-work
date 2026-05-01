import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useApplyReconciliationFix,
  useReconciliationHistory,
  useReconciliationScan,
} from "@/hooks/admin/useReconciliation";
import {
  Divergence,
  FIX_LABELS,
  Severity,
  VALIDATOR_LABELS,
} from "@/lib/admin/reconciliationService";

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

function severityBadge(sev: Severity) {
  const cls: Record<Severity, string> = {
    critical: "bg-rose-600 text-white hover:bg-rose-600",
    high: "bg-amber-500 text-white hover:bg-amber-500",
    medium: "bg-yellow-400 text-foreground hover:bg-yellow-400",
    low: "bg-sky-500 text-white hover:bg-sky-500",
    info: "bg-muted text-muted-foreground hover:bg-muted",
  };
  return <Badge className={cn("uppercase text-[10px]", cls[sev])}>{sev}</Badge>;
}

export default function AdminReconciliation() {
  const { data: scan, isLoading, isFetching, refetch } = useReconciliationScan();
  const { data: history } = useReconciliationHistory();
  const fix = useApplyReconciliationFix();

  const [filterSev, setFilterSev] = useState<Severity | "all">("all");
  const [target, setTarget] = useState<Divergence | null>(null);
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => {
    const list = scan?.divergences ?? [];
    const sorted = [...list].sort(
      (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
    );
    return filterSev === "all" ? sorted : sorted.filter((d) => d.severity === filterSev);
  }, [scan, filterSev]);

  const counts = scan?.counts;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Reconciliação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detecta inconsistências operacionais/financeiras e aplica correções idempotentes auditadas.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} size="sm">
          <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
          Rodar scan
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {SEV_ORDER.slice(0, 4).map((s) => (
          <Card
            key={s}
            className={cn("cursor-pointer transition", filterSev === s && "ring-2 ring-primary")}
            onClick={() => setFilterSev(filterSev === s ? "all" : s)}
          >
            <CardContent className="p-4">
              <div className="text-xs uppercase text-muted-foreground">{s}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {counts ? (counts as any)[s] ?? 0 : "—"}
              </div>
            </CardContent>
          </Card>
        ))}
        <Card
          className={cn("cursor-pointer transition", filterSev === "all" && "ring-2 ring-primary")}
          onClick={() => setFilterSev("all")}
        >
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums">{counts?.total ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="divergences">
        <TabsList>
          <TabsTrigger value="divergences">
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            Divergências
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="divergences" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Divergências detectadas</CardTitle>
                <CardDescription>
                  {scan?.scanned_at
                    ? `Último scan: ${new Date(scan.scanned_at).toLocaleString("pt-BR")}`
                    : "Aguardando scan…"}
                </CardDescription>
              </div>
              <Select value={filterSev} onValueChange={(v) => setFilterSev(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas severidades</SelectItem>
                  {SEV_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500" />
                  <div className="text-sm">Sem divergências para o filtro atual.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((d, i) => (
                    <div
                      key={`${d.validator}-${d.entity_id}-${i}`}
                      className="border rounded-md p-3 flex items-start justify-between gap-3 bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {severityBadge(d.severity)}
                          <span className="font-medium text-sm">
                            {VALIDATOR_LABELS[d.validator] ?? d.validator}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                          {d.entity_type}#{d.entity_id}
                          {d.details?.workspace_name && ` · ${d.details.workspace_name}`}
                        </div>
                        <pre className="text-[11px] mt-2 p-2 rounded bg-muted/40 overflow-auto max-h-28">
                          {JSON.stringify(d.details, null, 2)}
                        </pre>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(d);
                          setReason("");
                        }}
                      >
                        <Wrench className="h-4 w-4 mr-1.5" />
                        Corrigir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de reconciliação</CardTitle>
              <CardDescription>Scans e correções com snapshot antes/depois.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px]">
                <div className="space-y-2">
                  {(history ?? []).map((row) => (
                    <div key={row.id} className="border rounded-md p-3 bg-card">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <Badge variant={row.kind === "fix" ? "default" : "secondary"}>
                          {row.kind}
                        </Badge>
                        {row.severity && severityBadge(row.severity as Severity)}
                        <span className="font-medium">
                          {row.validator ? VALIDATOR_LABELS[row.validator] ?? row.validator : "—"}
                        </span>
                        <span className="ml-auto text-muted-foreground">
                          {new Date(row.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        por {row.actor_email ?? "sistema"}
                        {row.entity_id && (
                          <span className="font-mono ml-2">
                            · {row.entity_type}#{row.entity_id}
                          </span>
                        )}
                      </div>
                      {row.reason && (
                        <div className="text-xs mt-1 italic">"{row.reason}"</div>
                      )}
                      {row.kind === "fix" && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-1">
                              Antes
                            </div>
                            <pre className="text-[10px] p-2 rounded bg-muted/40 overflow-auto max-h-32">
                              {JSON.stringify(row.before_snapshot, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-1">
                              Depois
                            </div>
                            <pre className="text-[10px] p-2 rounded bg-muted/40 overflow-auto max-h-32">
                              {JSON.stringify(row.after_snapshot, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                      {row.kind === "scan" && (
                        <pre className="text-[10px] mt-2 p-2 rounded bg-muted/40 overflow-auto">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                  {(!history || history.length === 0) && (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      Sem registros ainda.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar correção</DialogTitle>
            <DialogDescription>
              {target && (VALIDATOR_LABELS[target.validator] ?? target.validator)}
            </DialogDescription>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {severityBadge(target.severity)}
                <span className="font-mono text-xs break-all">
                  {target.entity_type}#{target.entity_id}
                </span>
              </div>
              <div className="rounded border bg-muted/30 p-3">
                <div className="text-xs font-medium mb-1">Ação proposta</div>
                <div className="text-xs">{FIX_LABELS[target.validator] ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  Operação idempotente: rodar de novo não tem efeito adicional.
                </div>
              </div>
              <div>
                <Label htmlFor="reason">Motivo (obrigatório, mín. 4 caracteres)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Ex.: invoice paga confirmada com PSP em 30/04"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!target || reason.trim().length < 4 || fix.isPending}
              onClick={async () => {
                if (!target) return;
                await fix.mutateAsync({
                  validator: target.validator,
                  entity_type: target.entity_type,
                  entity_id: target.entity_id,
                  reason: reason.trim(),
                });
                setTarget(null);
                refetch();
              }}
            >
              {fix.isPending ? "Aplicando…" : "Confirmar correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
