import { useState } from "react";
import { AlertTriangle, CheckCircle2, Flag, Loader2, ShieldAlert, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  useAckAlert, useAlerts, useCheckAlerts, useFlags, useResolveAlert, useSetFlag,
} from "@/hooks/admin/useOperations";
import { formatDateTime } from "@/lib/billing/format";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary", warning: "default", critical: "destructive",
};

const GO_NO_GO = [
  { id: "rbac", label: "RBAC revisado (platform_owner / finance / support / security)" },
  { id: "rls", label: "RLS habilitado em todas as tabelas sensíveis" },
  { id: "session", label: "Heartbeat de sessão admin ativo + revogação testada" },
  { id: "audit", label: "Auditoria cobre suspend/reactivate/finance/role grant" },
  { id: "billing_mock", label: "Provider mock validado em homologação" },
  { id: "dunning", label: "Política de dunning + grace period configurada" },
  { id: "reconciliation", label: "Scan de reconciliação rodado sem críticos" },
  { id: "exports", label: "Exports CSV testados (clientes, invoices, audit)" },
  { id: "alerts", label: "Alertas operacionais ativos (past_due, churn, mutation_failures)" },
  { id: "kill_switch", label: "Kill switch testado e documentado" },
  { id: "runbooks", label: "Runbooks revisados (financeiro, segurança, rollback)" },
  { id: "rollback", label: "Plano de rollback validado em staging" },
];

export default function AdminOperations() {
  const alerts = useAlerts();
  const flags = useFlags();
  const check = useCheckAlerts();
  const ack = useAckAlert();
  const resolve = useResolveAlert();
  const setFlag = useSetFlag();

  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [flagDialog, setFlagDialog] = useState<{ key: string; next: boolean } | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const handleCheck = async () => {
    try {
      const created = await check.mutateAsync();
      toast.success(`Checagem concluída — ${created} novo(s) alerta(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao checar alertas");
    }
  };

  const checklistDone = GO_NO_GO.filter((i) => checklist[i.id]).length;
  const goReady = checklistDone === GO_NO_GO.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Siren className="h-6 w-6 text-primary" /> Operações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alertas, kill switch, feature flags e checklist de go-live.
        </p>
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="flags">Feature flags</TabsTrigger>
          <TabsTrigger value="gonogo">Go / No-Go</TabsTrigger>
        </TabsList>

        {/* ===== ALERTS ===== */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" /> Alertas operacionais
                </CardTitle>
                <CardDescription>
                  Detecta past_due spike (&gt;5%), churn 30d (&gt;8%) e mutation failures (1h).
                </CardDescription>
              </div>
              <Button onClick={handleCheck} disabled={check.isPending}>
                {check.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Rodar check agora
              </Button>
            </CardHeader>
            <CardContent>
              {alerts.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (
                <div className="overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Severidade</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(alerts.data ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{formatDateTime(a.created_at)}</TableCell>
                          <TableCell><Badge variant="outline">{a.kind}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={SEVERITY_VARIANT[a.severity] ?? "default"}>{a.severity}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{a.title}</TableCell>
                          <TableCell><Badge variant="secondary">{a.status}</Badge></TableCell>
                          <TableCell className="space-x-2">
                            {a.status === "open" && (
                              <Button size="sm" variant="outline" onClick={() => ack.mutate(a.id)}>
                                Ack
                              </Button>
                            )}
                            {a.status !== "resolved" && (
                              <Button size="sm" onClick={() => { setResolving(a.id); setResolveNote(""); }}>
                                Resolver
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(alerts.data ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                            Nenhum alerta registrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== FLAGS ===== */}
        <TabsContent value="flags" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" /> Feature flags & Kill switch
              </CardTitle>
              <CardDescription>
                Apenas platform_owner e security_admin podem alterar. Toda mudança é auditada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {flags.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (
                (flags.data ?? []).map((f) => (
                  <div key={f.key} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <div className="font-medium font-mono text-sm flex items-center gap-2">
                        {f.key === "platform_kill_switch" && (
                          <ShieldAlert className="h-4 w-4 text-destructive" />
                        )}
                        {f.key}
                      </div>
                      <div className="text-xs text-muted-foreground">{f.description}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Atualizado em {formatDateTime(f.updated_at)}
                      </div>
                    </div>
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={(next) => { setFlagDialog({ key: f.key, next }); setFlagReason(""); }}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== GO / NO-GO ===== */}
        <TabsContent value="gonogo" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Checklist Go-Live
              </CardTitle>
              <CardDescription>
                {checklistDone}/{GO_NO_GO.length} confirmados.{" "}
                {goReady ? (
                  <span className="text-green-600 font-medium">Pronto para go-live ✅</span>
                ) : (
                  <span>Marque cada item após validação manual.</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {GO_NO_GO.map((item) => (
                <label key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checklist[item.id]}
                    onChange={(e) => setChecklist({ ...checklist, [item.id]: e.target.checked })}
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Resolve dialog */}
      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver alerta</DialogTitle>
            <DialogDescription>Justificativa fica registrada na auditoria.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex.: past_due voltou ao normal após retry batch."
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                try {
                  await resolve.mutateAsync({ id: resolving!, note: resolveNote });
                  toast.success("Alerta resolvido");
                  setResolving(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha");
                }
              }}
              disabled={resolveNote.trim().length < 3}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flag dialog */}
      <Dialog open={!!flagDialog} onOpenChange={(o) => !o && setFlagDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {flagDialog?.next ? "Ativar" : "Desativar"} flag <code>{flagDialog?.key}</code>
            </DialogTitle>
            <DialogDescription>
              {flagDialog?.key === "platform_kill_switch" && flagDialog.next
                ? "⚠️  Isso bloqueia mutações administrativas críticas em todo o backoffice."
                : "Justificativa fica registrada na auditoria."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da alteração"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialog(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                try {
                  await setFlag.mutateAsync({
                    key: flagDialog!.key, enabled: flagDialog!.next, reason: flagReason,
                  });
                  toast.success("Flag atualizada");
                  setFlagDialog(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha");
                }
              }}
              disabled={flagReason.trim().length < 3}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
