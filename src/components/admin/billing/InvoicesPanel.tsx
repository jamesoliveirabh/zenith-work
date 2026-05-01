import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AdminActionDialog } from './AdminActionDialog';
import { useAdminGenerateInvoice, useAdminMarkInvoice } from '@/hooks/useAdminBilling';
import { formatMoney, formatDateTime } from '@/lib/billing/format';

interface Invoice {
  id: string; status: string;
  amount_due_cents: number; amount_paid_cents: number;
  currency: string;
  created_at: string; due_at?: string | null; paid_at?: string | null;
}

interface Props {
  workspaceId: string;
  invoices: Array<Record<string, unknown>>;
}

const statusVariant = (s: string): 'default' | 'destructive' | 'outline' | 'secondary' => {
  if (s === 'paid') return 'default';
  if (s === 'open') return 'secondary';
  if (s === 'void' || s === 'uncollectible') return 'outline';
  return 'destructive';
};

export function InvoicesPanel({ workspaceId, invoices }: Props) {
  const [genOpen, setGenOpen] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [markTarget, setMarkTarget] = useState<{ id: string; status: 'paid' | 'void' | 'uncollectible' } | null>(null);

  const gen = useAdminGenerateInvoice();
  const mark = useAdminMarkInvoice();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Faturas</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setGenOpen(true)}>
            Gerar fatura mock
          </Button>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem faturas.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoices as unknown as Invoice[]).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell><Badge variant={statusVariant(i.status)}>{i.status}</Badge></TableCell>
                    <TableCell>{formatMoney(i.amount_due_cents, i.currency)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(i.created_at)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(i.due_at)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {i.status !== 'paid' && (
                        <Button size="sm" variant="ghost" onClick={() => setMarkTarget({ id: i.id, status: 'paid' })}>
                          Marcar paga
                        </Button>
                      )}
                      {i.status === 'open' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setMarkTarget({ id: i.id, status: 'void' })}>
                            Void
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setMarkTarget({ id: i.id, status: 'uncollectible' })}>
                            Uncollectible
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AdminActionDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        title="Gerar fatura mock"
        confirmLabel="Gerar"
        loading={gen.isPending}
        onConfirm={async (reason) => {
          await gen.mutateAsync({ workspaceId, amountCents: amount, description: 'Admin manual', reason });
          setGenOpen(false);
        }}
      >
        <div className="space-y-2">
          <Label>Valor (centavos)</Label>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
      </AdminActionDialog>

      <AdminActionDialog
        open={!!markTarget}
        onOpenChange={(o) => !o && setMarkTarget(null)}
        title={`Marcar fatura como ${markTarget?.status ?? ''}`}
        destructive={markTarget?.status !== 'paid'}
        confirmPhrase={markTarget?.status === 'paid' ? undefined : 'CONFIRMAR'}
        loading={mark.isPending}
        onConfirm={async (reason) => {
          if (!markTarget) return;
          await mark.mutateAsync({ invoiceId: markTarget.id, status: markTarget.status, reason });
          setMarkTarget(null);
        }}
      />
    </>
  );
}
