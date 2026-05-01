import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
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
import { useAdminInvoices } from "@/hooks/admin/useFinance";
import { useAdminMarkInvoice } from "@/hooks/useAdminBilling";
import { AdminActionDialog } from "@/components/admin/billing/AdminActionDialog";
import { formatMoney, formatDate } from "@/lib/billing/format";

const STATUSES = ["draft", "open", "paid", "void", "uncollectible"];

const statusVariant = (s: string): "default" | "destructive" | "outline" | "secondary" => {
  if (s === "paid") return "default";
  if (s === "open") return "secondary";
  if (s === "void" || s === "uncollectible") return "outline";
  return "destructive";
};

export default function AdminFinanceInvoices() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const [markTarget, setMarkTarget] = useState<{ id: string; status: "paid" | "void" | "uncollectible" } | null>(null);
  const mark = useAdminMarkInvoice();

  const { data = [], isLoading } = useAdminInvoices({
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
        <h1 className="text-2xl font-semibold tracking-tight">Faturas</h1>
        <p className="text-sm text-muted-foreground">
          Listagem global de faturas. Para gerar faturas mock, abra a tela 360 do cliente.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por workspace ou ID da fatura"
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
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Criada</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma fatura encontrada.</TableCell></TableRow>
              ) : data.map((i) => (
                <TableRow key={i.invoice_id}>
                  <TableCell className="font-medium">{i.workspace_name}</TableCell>
                  <TableCell>{i.plan_code ?? "—"}</TableCell>
                  <TableCell>{formatMoney(i.amount_due_cents, i.currency)}</TableCell>
                  <TableCell><Badge variant={statusVariant(i.status)}>{i.status}</Badge></TableCell>
                  <TableCell className="text-sm">{formatDate(i.due_at)}</TableCell>
                  <TableCell className="text-sm">{formatDate(i.created_at)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {i.status !== "paid" && (
                      <Button size="sm" variant="ghost" onClick={() => setMarkTarget({ id: i.invoice_id, status: "paid" })}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Paga
                      </Button>
                    )}
                    {i.status === "open" && (
                      <Button size="sm" variant="ghost" onClick={() => setMarkTarget({ id: i.invoice_id, status: "void" })}>
                        <XCircle className="h-4 w-4 mr-1" /> Void
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/clients/${i.workspace_id}`}>
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
        <span>{Number(total)} fatura(s) — página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </div>

      <AdminActionDialog
        open={!!markTarget}
        onOpenChange={(o) => !o && setMarkTarget(null)}
        title={`Marcar fatura como ${markTarget?.status ?? ""}`}
        description="Esta ação será registrada no log de auditoria e atualizará a fatura imediatamente."
        confirmLabel="Confirmar"
        loading={mark.isPending}
        onConfirm={async (reason) => {
          if (!markTarget) return;
          await mark.mutateAsync({
            invoiceId: markTarget.id,
            status: markTarget.status,
            reason: reason!,
          });
          setMarkTarget(null);
        }}
      />
    </div>
  );
}
