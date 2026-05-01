import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";
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
import { useAdminSubscriptions } from "@/hooks/admin/useFinance";
import { usePlans } from "@/hooks/useBillingFoundation";
import { formatDate } from "@/lib/billing/format";

const STATUSES = ["trialing", "active", "past_due", "canceled", "incomplete"];

const statusVariant = (s: string): "default" | "destructive" | "outline" | "secondary" => {
  if (s === "active") return "default";
  if (s === "trialing") return "secondary";
  if (s === "past_due" || s === "incomplete") return "destructive";
  return "outline";
};

export default function AdminFinanceSubscriptions() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [planCode, setPlanCode] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data: plans = [] } = usePlans();
  const { data = [], isLoading } = useAdminSubscriptions({
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    planCode: planCode === "all" ? undefined : planCode,
    page,
    pageSize,
  });

  const total = data[0]?.total_count ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(Number(total) / pageSize)), [total]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinaturas</h1>
        <p className="text-sm text-muted-foreground">
          Listagem global de assinaturas. Ações por conta na tela 360.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome do workspace, email do owner ou ID"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={planCode} onValueChange={(v) => { setPlanCode(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Plano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os planos</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
              ))}
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
                <TableHead>Owner</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial até</TableHead>
                <TableHead>Período até</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma assinatura encontrada.</TableCell></TableRow>
              ) : data.map((s) => (
                <TableRow key={s.subscription_id}>
                  <TableCell className="font-medium">{s.workspace_name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.owner_email ?? "—"}</TableCell>
                  <TableCell>{s.plan_name ?? s.plan_code ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                      {s.cancel_at_period_end && <Badge variant="outline" className="text-xs">cancel agendado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(s.trial_ends_at)}</TableCell>
                  <TableCell className="text-sm">{formatDate(s.current_period_end)}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/clients/${s.workspace_id}`}>
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
        <span>{Number(total)} assinatura(s) — página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}
