import { useState } from "react";
import { Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdminActionDialog } from "@/components/admin/billing/AdminActionDialog";
import { useAdminSessions, useRevokeSession } from "@/hooks/admin/useSecurity";
import { formatDateTime } from "@/lib/billing/format";

export default function AdminSecuritySessions() {
  const { data = [], isLoading } = useAdminSessions();
  const revoke = useRevokeSession();
  const [target, setTarget] = useState<{ id: string; email: string | null } | null>(null);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessões de admin</h1>
        <p className="text-sm text-muted-foreground">
          Sessões ativas e históricas no backoffice. Revogar registra evento de auditoria.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead>IP / User-Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma sessão registrada.</TableCell></TableRow>
              ) : data.map((s) => {
                const active = !s.ended_at;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{s.email ?? s.user_id}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(s.started_at)}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(s.last_seen_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={s.user_agent ?? ""}>
                      {s.ip ?? "—"} · {s.user_agent ?? "—"}
                    </TableCell>
                    <TableCell>
                      {active
                        ? <Badge variant="default">ativa</Badge>
                        : <Badge variant="outline">encerrada</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {active && (
                        <Button size="sm" variant="ghost" onClick={() => setTarget({ id: s.id, email: s.email })}>
                          <Ban className="h-4 w-4 mr-1" /> Revogar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AdminActionDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Revogar sessão"
        description={target ? `Sessão de ${target.email ?? "usuário"} será encerrada.` : ""}
        confirmLabel="Revogar"
        destructive
        loading={revoke.isPending}
        onConfirm={async (reason) => {
          if (!target) return;
          await revoke.mutateAsync({ sessionId: target.id, reason });
          setTarget(null);
        }}
      />
    </div>
  );
}
