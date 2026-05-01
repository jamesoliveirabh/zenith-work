import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/billing/format';
import type { AdminAccountRow } from '@/types/admin-billing';
import { toast } from '@/hooks/use-toast';

interface Props {
  rows: AdminAccountRow[] | undefined;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const subVariant = (s: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (s) {
    case 'active': return 'default';
    case 'trialing': return 'secondary';
    case 'past_due': return 'destructive';
    case 'canceled': return 'outline';
    default: return 'outline';
  }
};

export function AccountsTable({ rows, isLoading, page, pageSize, onPageChange }: Props) {
  const navigate = useNavigate();
  const total = rows?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(total) / pageSize));

  if (isLoading && !rows) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Nenhuma conta encontrada com os filtros atuais.
      </div>
    );
  }

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id).then(
      () => toast({ title: 'ID copiado' }),
      () => toast({ title: 'Erro ao copiar', variant: 'destructive' }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Dunning</TableHead>
              <TableHead>MRR</TableHead>
              <TableHead>Próx. ciclo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.workspace_id} className="cursor-pointer" onClick={() => navigate(`/admin/billing/accounts/${r.workspace_id}`)}>
                <TableCell>
                  <div className="font-medium">{r.workspace_name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="truncate max-w-[14rem]">{r.workspace_id}</span>
                    <button
                      className="hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); copyId(r.workspace_id); }}
                      title="Copiar ID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.owner_name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.owner_email ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.plan_name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.plan_code ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={subVariant(r.sub_status)}>{r.sub_status ?? 'sem assinatura'}</Badge>
                  {r.cancel_at_period_end && (
                    <div className="text-xs text-amber-600 mt-1">cancela ao fim do ciclo</div>
                  )}
                </TableCell>
                <TableCell>
                  {r.dunning_status
                    ? <Badge variant="destructive">{r.dunning_status}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {r.price_cents != null ? formatMoney(r.price_cents, r.currency ?? 'BRL') : '—'}
                </TableCell>
                <TableCell className="text-sm">{formatDate(r.current_period_end)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); navigate(`/admin/billing/accounts/${r.workspace_id}`); }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{Number(total)} contas · página {page + 1} de {totalPages}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0 || isLoading} onClick={() => onPageChange(page - 1)}>
            Anterior
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages || isLoading} onClick={() => onPageChange(page + 1)}>
            Próxima {isLoading && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
