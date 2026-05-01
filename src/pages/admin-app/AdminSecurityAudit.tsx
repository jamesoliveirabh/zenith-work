import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAdminAudit } from "@/hooks/admin/useSecurity";
import { formatDateTime } from "@/lib/billing/format";

const EVENT_FILTERS = [
  "login_success", "login_failed", "access_denied", "logout",
  "role.granted", "role.revoked",
  "admin.disabled", "admin.enabled",
  "session.revoked",
  "mfa.enforcement_toggled",
  "workspace.suspended", "workspace.reactivated", "workspace.note_added",
];

export default function AdminSecurityAudit() {
  const [search, setSearch] = useState("");
  const [event, setEvent] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data = [], isLoading } = useAdminAudit({
    search: search.trim() || undefined,
    event: event === "all" ? undefined : event,
    page,
    pageSize,
  });

  const total = data[0]?.total_count ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(Number(total) / pageSize)), [total]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria do backoffice</h1>
        <p className="text-sm text-muted-foreground">
          Trilha completa de logins, mudanças de papel, ações administrativas e eventos de risco.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por email, evento ou conteúdo do metadata"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={event} onValueChange={(v) => { setEvent(v); setPage(0); }}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent className="max-h-[400px]">
              <SelectItem value="all">Todos os eventos</SelectItem>
              {EVENT_FILTERS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum evento.</TableCell></TableRow>
              ) : data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-sm">{row.email ?? row.admin_user_id ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{row.event}</Badge></TableCell>
                  <TableCell className="text-xs">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-[640px]">
                      {Object.keys(row.metadata ?? {}).length > 0
                        ? JSON.stringify(row.metadata, null, 0)
                        : "—"}
                    </pre>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{Number(total)} evento(s) — página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}
