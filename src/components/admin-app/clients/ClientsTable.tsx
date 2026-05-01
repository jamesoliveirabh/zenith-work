import { Link } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, AlertOctagon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ClientRow } from "@/lib/admin/clientsService";

interface Props { rows: ClientRow[]; loading?: boolean }

function statusVariant(s: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!s) return "outline";
  if (s === "active") return "default";
  if (s === "trialing") return "secondary";
  if (s === "past_due" || s === "canceled") return "destructive";
  return "outline";
}

export function ClientsTable({ rows, loading }: Props) {
  if (loading) {
    return <div className="text-sm text-muted-foreground p-6">Carregando clientes…</div>;
  }
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground p-6">Nenhum cliente encontrado.</div>;
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workspace</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.workspace_id}>
              <TableCell>
                <div className="font-medium flex items-center gap-2">
                  {r.workspace_name}
                  {r.is_suspended && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertOctagon className="h-3 w-3" /> Suspenso
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {r.workspace_slug ?? r.workspace_id.slice(0, 8)}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{r.owner_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.owner_email ?? "—"}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{r.plan_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.plan_code ?? ""}</div>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(r.sub_status)}>{r.sub_status ?? "—"}</Badge>
                {r.open_dunning_case_id && (
                  <Badge variant="destructive" className="ml-1">Dunning</Badge>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.workspace_created_at
                  ? format(new Date(r.workspace_created_at), "dd/MM/yyyy", { locale: ptBR })
                  : "—"}
              </TableCell>
              <TableCell>
                <Button asChild size="icon" variant="ghost">
                  <Link to={`/clients/${r.workspace_id}`} aria-label="Abrir cliente">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
