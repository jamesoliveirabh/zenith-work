import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminActionDialog } from './AdminActionDialog';
import {
  useAdminForceDunningRetry, useAdminExtendGracePeriod, useAdminCloseDunningCase,
} from '@/hooks/useAdminBilling';
import { formatDateTime } from '@/lib/billing/format';

interface Props {
  dunningCase: Record<string, unknown> | null;
  attempts: Array<Record<string, unknown>>;
}

export function DunningPanel({ dunningCase, attempts }: Props) {
  const [retryOpen, setRetryOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [retryResult, setRetryResult] = useState<'paid' | 'failed'>('failed');

  const retry = useAdminForceDunningRetry();
  const extend = useAdminExtendGracePeriod();
  const closeCase = useAdminCloseDunningCase();

  if (!dunningCase) {
    return (
      <Card>
        <CardHeader><CardTitle>Inadimplência (Dunning)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nenhum caso ativo de dunning.
        </CardContent>
      </Card>
    );
  }

  const caseId = String(dunningCase.id);
  const status = String(dunningCase.status);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Inadimplência (Dunning)</CardTitle>
          <Badge variant={status === 'recovered' ? 'default' : 'destructive'}>{status}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Tentativas: </span>{String(dunningCase.retry_count ?? 0)}</div>
            <div><span className="text-muted-foreground">Próxima tentativa: </span>{formatDateTime(dunningCase.next_retry_at as string | null)}</div>
            <div><span className="text-muted-foreground">Carência até: </span>{formatDateTime(dunningCase.grace_ends_at as string | null)}</div>
            <div><span className="text-muted-foreground">Aberto em: </span>{formatDateTime(dunningCase.created_at as string | null)}</div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setRetryOpen(true)}>Forçar retry</Button>
            <Button size="sm" variant="outline" onClick={() => setExtendOpen(true)}>Estender carência</Button>
            <Button size="sm" variant="destructive" onClick={() => setCloseOpen(true)}>Encerrar (cancelar)</Button>
          </div>

          {attempts.length > 0 && (
            <div className="pt-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Tentativas</div>
              <ul className="text-xs space-y-1">
                {attempts.map((a) => (
                  <li key={String(a.id)} className="flex justify-between">
                    <span>#{String(a.attempt_number)} · {String(a.result)}</span>
                    <span className="text-muted-foreground">{formatDateTime(a.created_at as string | null)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <AdminActionDialog
        open={retryOpen}
        onOpenChange={setRetryOpen}
        title="Forçar retry de cobrança"
        confirmLabel="Executar retry"
        loading={retry.isPending}
        onConfirm={async (reason) => {
          await retry.mutateAsync({ caseId, result: retryResult, reason });
          setRetryOpen(false);
        }}
      >
        <div className="space-y-2">
          <Label>Resultado simulado</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={retryResult === 'paid' ? 'default' : 'outline'}
              onClick={() => setRetryResult('paid')}>Sucesso</Button>
            <Button type="button" size="sm" variant={retryResult === 'failed' ? 'destructive' : 'outline'}
              onClick={() => setRetryResult('failed')}>Falha</Button>
          </div>
        </div>
      </AdminActionDialog>

      <AdminActionDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title="Estender período de carência"
        loading={extend.isPending}
        onConfirm={async (reason) => {
          await extend.mutateAsync({ caseId, additionalDays: days, reason });
          setExtendOpen(false);
        }}
      >
        <div className="space-y-2">
          <Label>Dias adicionais</Label>
          <Input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </div>
      </AdminActionDialog>

      <AdminActionDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Encerrar caso por inadimplência"
        description="A assinatura será cancelada e a workspace volta para o plano free."
        destructive
        confirmPhrase="CANCELAR"
        confirmLabel="Confirmar cancelamento"
        loading={closeCase.isPending}
        onConfirm={async (reason) => {
          await closeCase.mutateAsync({ caseId, reason });
          setCloseOpen(false);
        }}
      />
    </>
  );
}
