import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertOctagon, ArrowLeft, Clock, CreditCard, FileText, Power, PowerOff, StickyNote, Users,
} from "lucide-react";
import {
  useAddInternalNote, useClientDetail, useReactivateWorkspace, useSuspendWorkspace,
} from "@/hooks/admin/useClients";
import { PlatformAdminActionDialog } from "@/components/admin-app/PlatformAdminActionDialog";

function fmtDate(v: unknown) {
  if (!v || typeof v !== "string") return "—";
  try { return format(new Date(v), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return "—"; }
}

export default function AdminClientDetail() {
  const { workspaceId = "" } = useParams<{ workspaceId: string }>();
  const { data, isLoading, error } = useClientDetail(workspaceId);
  const suspend = useSuspendWorkspace(workspaceId);
  const reactivate = useReactivateWorkspace(workspaceId);
  const addNote = useAddInternalNote(workspaceId);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Erro: {(error as Error).message}</div>;
  if (!data) return null;

  const ws = (data.workspace ?? {}) as Record<string, unknown>;
  const owner = data.owner as Record<string, unknown> | null;
  const sub = data.subscription;
  const isSuspended = !!ws.is_suspended;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Button asChild size="sm" variant="ghost" className="mb-2">
          <Link to="/clients"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              {String(ws.name ?? "—")}
              {isSuspended && (
                <Badge variant="destructive" className="gap-1">
                  <AlertOctagon className="h-3 w-3" /> Suspenso
                </Badge>
              )}
            </h1>
            <div className="text-xs text-muted-foreground font-mono mt-1">{workspaceId}</div>
          </div>
          <div className="flex gap-2">
            {isSuspended ? (
              <Button onClick={() => setReactivateOpen(true)} variant="default">
                <Power className="h-4 w-4 mr-1.5" /> Reativar
              </Button>
            ) : (
              <Button onClick={() => setSuspendOpen(true)} variant="destructive">
                <PowerOff className="h-4 w-4 mr-1.5" /> Suspender
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Top row: workspace · owner · subscription */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <Row label="Slug" value={String(ws.slug ?? "—")} />
            <Row label="Criado em" value={fmtDate(ws.created_at)} />
            <Row label="Membros" value={String(data.member_count)} />
            {isSuspended && (
              <>
                <Row label="Suspenso em" value={fmtDate(ws.suspended_at)} />
                <Row label="Motivo" value={String(ws.suspended_reason ?? "—")} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Owner principal
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {owner ? (
              <>
                <Row label="Nome" value={String(owner.display_name ?? "—")} />
                <Row label="Email" value={String(owner.email ?? "—")} />
                <Row label="ID" value={String(owner.id ?? "—")} mono />
              </>
            ) : (
              <div className="text-muted-foreground">Sem owner mapeado.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {sub?.subscription ? (
              <>
                <Row label="Plano" value={String(sub.plan?.name ?? sub.subscription.plan_id ?? "—")} />
                <Row label="Status" value={String(sub.subscription.status ?? "—")} />
                <Row label="Período termina" value={fmtDate(sub.subscription.current_period_end)} />
                <Row label="Trial até" value={fmtDate(sub.subscription.trial_ends_at)} />
              </>
            ) : (
              <div className="text-muted-foreground">Sem assinatura.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage snapshot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Uso (snapshot)</CardTitle>
          <CardDescription>Contagens atuais por recurso.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Object.entries(data.usage_snapshot ?? {}).map(([k, v]) => (
              <div key={k} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground capitalize">{k}</div>
                <div className="text-lg font-semibold">{Number(v).toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Internal notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4" /> Observações internas
          </CardTitle>
          <CardDescription>Visíveis apenas para o time interno. Cada inclusão é auditada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="note" className="text-xs">Nova observação</Label>
            <Textarea
              id="note" rows={3} maxLength={2000}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Ex.: Cliente solicitou pausa por 30 dias via ticket #4321"
            />
            <div className="flex justify-between items-center">
              <div className="text-xs text-muted-foreground">{noteBody.length}/2000</div>
              <Button
                size="sm"
                disabled={addNote.isPending || noteBody.trim().length === 0}
                onClick={async () => {
                  try {
                    await addNote.mutateAsync(noteBody);
                    setNoteBody("");
                    toast.success("Observação registrada");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Falha ao salvar");
                  }
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <div className="divide-y border-t pt-3">
            {data.notes.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem observações ainda.</div>
            ) : (
              data.notes.map((n) => (
                <div key={n.id} className="py-2 text-sm">
                  <div className="whitespace-pre-wrap">{n.body}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {n.author_email ?? "—"} · {fmtDate(n.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Eventos recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_events.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem eventos.</div>
          ) : (
            <ul className="divide-y text-sm">
              {data.recent_events.map((ev, i) => (
                <li key={(ev.id as string) ?? i} className="py-2 flex items-center gap-3">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                    {String(ev.event_type ?? "event")}
                  </span>
                  <span className="flex-1 text-xs text-muted-foreground truncate">
                    {JSON.stringify(ev.payload ?? {})}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDate(ev.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Audit trail (admin actions on this workspace) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trilha de auditoria</CardTitle>
          <CardDescription>Ações administrativas nesta conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.platform_actions.length === 0 && data.admin_actions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem ações registradas.</div>
          ) : (
            <ul className="divide-y text-sm">
              {[...data.platform_actions, ...data.admin_actions]
                .sort((a, b) =>
                  String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
                )
                .slice(0, 30)
                .map((a, i) => (
                  <li key={(a.id as string) ?? i} className="py-2 flex items-center gap-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                      {String(a.event ?? a.action ?? "—")}
                    </span>
                    <span className="flex-1 text-xs text-muted-foreground truncate">
                      {String(a.email ?? a.admin_user_id ?? "—")}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Action dialogs */}
      <PlatformAdminActionDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspender workspace"
        description="O acesso permanece, mas a conta fica marcada como suspensa para o time interno e billing."
        confirmLabel="Suspender"
        variant="destructive"
        onConfirm={(reason) => suspend.mutateAsync(reason)}
      />
      <PlatformAdminActionDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Reativar workspace"
        description="Remove a marca de suspensão da conta."
        confirmLabel="Reativar"
        onConfirm={(reason) => reactivate.mutateAsync(reason)}
      />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
