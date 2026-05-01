import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { formatDate, formatMoney } from '@/lib/billing/format';
import type { WorkspaceInvoice } from '@/types/billing';
import { FileText } from 'lucide-react';

interface Props {
  invoices: WorkspaceInvoice[];
  loading?: boolean;
}

export function InvoiceTable({ invoices, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        Nenhuma fatura emitida ainda.
      </div>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Criada em</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{formatDate(inv.created_at)}</TableCell>
                <TableCell>{formatDate(inv.due_at)}</TableCell>
                <TableCell>{formatDate(inv.paid_at)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatMoney(inv.amount_due_cents, inv.currency)}
                </TableCell>
                <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {invoices.map((inv) => (
          <div key={inv.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{formatMoney(inv.amount_due_cents, inv.currency)}</span>
              <InvoiceStatusBadge status={inv.status} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Criada: {formatDate(inv.created_at)}</div>
              <div>Vence: {formatDate(inv.due_at)}</div>
              {inv.paid_at && <div>Paga: {formatDate(inv.paid_at)}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
