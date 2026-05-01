import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ExternalLink, RefreshCw, CalendarPlus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAdminDunningList } from "@/hooks/admin/useFinance";
import {
  useAdminForceDunningRetry,
  useAdminExtendGracePeriod,
  useAdminCloseDunningCase,
} from "@/hooks/useAdminBilling";
import { AdminActionDialog } from "@/components/admin/billing/AdminActionDialog";
import { formatDateTime } from "@/lib/billing/format";

const STATUSES = ["open", "recovering", "grace", "exhausted", "recovered", "closed"];

const statusVariant = (s: string): "default" | "destructive" | "outline" | "secondary" => {
  if (s === "recovered" || s === "closed") return "default";
  if (s === "grace" || s === "recovering") return "secondary";
  if (s === "exhausted") return "destructive";
  return "outline";
};

type Action = null
  | { kind: "retry"; caseId: string }
  | { kind: "extend"; caseId: string }
  | { kind: "close"; caseId: string };

export default function AdminFinanceDunning() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const [action, setAction] = useState<Action>(null);
  const [retryResult, setRetryResult] = useState<"paid" | "failed">("failed");
  const [extendDays, setExtendDays] = useState(7);

  const retry = useAdminForceDunningRetry();
  const extend = useAdminExtendGracePeriod();
  const closeCase = useAdminCloseDunningCase();

  const { data = [], isLoading } = useAdminDunningList({
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    page,
    pageSize,
  });

  const total = data[0]?.total_count ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(Number(total) / pageSize)), [total]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inadimplência (Dunning)</h1>
        <p className="text-sm text-muted-foreground">
          Casos abertos de cobrança em atraso. Ações executadas aqui são auditadas.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por workspace ou ID"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Próximo retry</TableHead>
                <TableHead>Carência até</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum caso encontrado.</TableCell></TableRow>
              ) : data.map((c) => (
                <TableRow key={c.case_id}>
                  <TableCell className="font-medium">{c.workspace_name}</TableCell>
                  <TableCell><Badge variant={statusVariant(c.status)}>{c.status}</Badge></TableCell>
                  <TableCell>{c.retry_count}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(c.next_retry_at)}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(c.grace_ends_at)}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(c.updated_at)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => { setRetryResult("failed"); setAction({ kind: "retry", caseId: c.case_id }); }}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Retry
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setExtendDays(7); setAction({ kind: "extend", caseId: c.case_id }); }}>
                      <CalendarPlus className="h-4 w-4 mr-1" /> Carência
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "close", caseId: c.case_id })}>
                      <X className="h-4 w-4 mr-1" /> Encerrar
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/clients/${c.workspace_id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{Number(total)} caso(s) — página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </div>

      {/* Retry */}
      <AdminActionDialog
        open={action?.kind === "retry"}
        onOpenChange={(o) => !o && setAction(null)}
        title="Forçar retry de cobrança"
        description="Simula uma nova tentativa de cobrança neste caso de inadimplência."
        confirmLabel="Executar retry"
        requireReason
        loading={retry.isPending}
        onConfirm={async (reason) => {
          if (action?.kind !== "retry") return;
          await retry.mutateAsync({ caseId: action.caseId, result: retryResult, reason: reason! });
          setAction(null);
        }}
      >
        <div className="space-y-2">
          <Label>Resultado simulado</Label>
          <Select value={retryResult} onValueChange={(v) => setRetryResult(v as "paid" | "failed")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="failed">Falha (mantém em dunning)</SelectItem>
              <SelectItem value="paid">Sucesso (recupera)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </AdminActionDialog>

      {/* Extend grace */}
      <AdminActionDialog
        open={action?.kind === "extend"}
        onOpenChange={(o) => !o && setAction(null)}
        title="Estender período de carência"
        description="Adiciona dias ao prazo final antes de cancelamento por inadimplência."
        confirmLabel="Estender"
        requireReason
        loading={extend.isPending}
        onConfirm={async (reason) => {
          if (action?.kind !== "extend") return;
          await extend.mutateAsync({ caseId: action.caseId, additionalDays: extendDays, reason: reason! });
          setAction(null);
        }}
      >
        <div className="space-y-2">
          <Label>Dias adicionais</Label>
          <Input
            type="number"
            min={1}
            max={90}
            value={extendDays}
            onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </AdminActionDialog>

      {/* Close */}
      <AdminActionDialog
        open={action?.kind === "close"}
        onOpenChange={(o) => !o && setAction(null)}
        title="Encerrar caso de dunning"
        description="Marca o caso como encerrado manualmente. A assinatura não é alterada."
        confirmLabel="Encerrar caso"
        requireReason
        loading={closeCase.isPending}
        onConfirm={async (reason) => {
          if (action?.kind !== "close") return;
          await closeCase.mutateAsync({ caseId: action.caseId, reason: reason! });
          setAction(null);
        }}
      />
    </div>
  );
}
