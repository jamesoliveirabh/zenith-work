import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminActionDialog } from './AdminActionDialog';
import {
  useAdminChangePlan, useAdminScheduleCancel, useAdminResumeSubscription, useAdminExtendTrial,
} from '@/hooks/useAdminBilling';
import { usePlans } from '@/hooks/useBillingFoundation';
import { formatDate } from '@/lib/billing/format';

interface Props {
  workspaceId: string;
  subscription: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
}

type DialogKind = null | 'change_plan' | 'extend_trial' | 'cancel' | 'resume';

export function SubscriptionPanel({ workspaceId, subscription, plan }: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [planCode, setPlanCode] = useState<string>('');
  const [days, setDays] = useState<number>(7);
  const { data: plans = [] } = usePlans();

  const changePlan = useAdminChangePlan();
  const cancel = useAdminScheduleCancel();
  const resume = useAdminResumeSubscription();
  const extendTrial = useAdminExtendTrial();

  const status = (subscription?.status as string | undefined) ?? 'sem assinatura';
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
  const trialEndsAt = subscription?.trial_ends_at as string | null | undefined;
  const periodEnd = subscription?.current_period_end as string | null | undefined;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Assinatura</CardTitle>
          <Badge variant={status === 'active' ? 'default' : status === 'past_due' ? 'destructive' : 'secondary'}>
            {status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Plano: </span>{(plan?.name as string) ?? '—'}</div>
            <div><span className="text-muted-foreground">Provider: </span>{(subscription?.billing_provider as string) ?? 'mock'}</div>
            <div><span className="text-muted-foreground">Trial até: </span>{formatDate(trialEndsAt)}</div>
            <div><span className="text-muted-foreground">Fim do ciclo: </span>{formatDate(periodEnd)}</div>
          </div>
          {cancelAtPeriodEnd && (
            <div className="text-amber-600 text-xs">⚠ Agendado para cancelar ao fim do ciclo</div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setDialog('change_plan')}>
              Trocar plano
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('extend_trial')}>
              Estender trial
            </Button>
            {!cancelAtPeriodEnd && status !== 'canceled' && (
              <Button size="sm" variant="outline" onClick={() => setDialog('cancel')}>
                Agendar cancelamento
              </Button>
            )}
            {cancelAtPeriodEnd && (
              <Button size="sm" variant="default" onClick={() => setDialog('resume')}>
                Reativar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AdminActionDialog
        open={dialog === 'change_plan'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Trocar plano da assinatura"
        description="A troca é imediata. O sistema gera os ajustes de fatura conforme política mock."
        confirmLabel="Trocar plano"
        loading={changePlan.isPending}
        onConfirm={async (reason) => {
          if (!planCode) return;
          await changePlan.mutateAsync({ workspaceId, planCode, mode: 'immediate', reason });
          setDialog(null);
        }}
      >
        <div className="space-y-2">
          <Label>Novo plano</Label>
          <Select value={planCode} onValueChange={setPlanCode}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => <SelectItem key={p.id} value={p.code}>{p.name} ({p.code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </AdminActionDialog>

      <AdminActionDialog
        open={dialog === 'extend_trial'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Estender trial"
        confirmLabel="Estender"
        loading={extendTrial.isPending}
        onConfirm={async (reason) => {
          await extendTrial.mutateAsync({ workspaceId, additionalDays: days, reason });
          setDialog(null);
        }}
      >
        <div className="space-y-2">
          <Label>Dias adicionais</Label>
          <Input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </div>
      </AdminActionDialog>

      <AdminActionDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Agendar cancelamento ao fim do ciclo"
        description="A assinatura permanecerá ativa até o fim do período. Pode ser revertido."
        confirmLabel="Agendar cancelamento"
        destructive
        loading={cancel.isPending}
        onConfirm={async (reason) => {
          await cancel.mutateAsync({ workspaceId, reason });
          setDialog(null);
        }}
      />

      <AdminActionDialog
        open={dialog === 'resume'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reativar assinatura"
        confirmLabel="Reativar"
        loading={resume.isPending}
        onConfirm={async (reason) => {
          await resume.mutateAsync({ workspaceId, reason });
          setDialog(null);
        }}
      />
    </>
  );
}
