import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';
import { formatDate } from '@/lib/billing/format';
import type { Plan, WorkspaceSubscription, SubscriptionMetadata } from '@/types/billing';
import { CalendarClock, AlertCircle } from 'lucide-react';

interface Props {
  subscription: WorkspaceSubscription | null;
  currentPlan: Plan | null;
  loading?: boolean;
}

export function BillingSummaryCard({ subscription, currentPlan, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const meta = (subscription as unknown as { metadata?: SubscriptionMetadata })?.metadata ?? {};
  const pending = meta.pending_plan_change;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Assinatura atual</CardTitle>
            <p className="text-2xl font-semibold mt-1">
              {currentPlan?.name ?? 'Sem plano ativo'}
            </p>
          </div>
          {subscription && <SubscriptionStatusBadge status={subscription.status} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!subscription && (
          <p className="text-muted-foreground">
            Este workspace ainda não possui uma assinatura. Escolha um plano abaixo para começar.
          </p>
        )}

        {subscription && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Info label="Início do ciclo" value={formatDate(subscription.current_period_start)} />
            <Info label="Fim do ciclo" value={formatDate(subscription.current_period_end)} />
            {subscription.trial_ends_at && (
              <Info label="Fim do trial" value={formatDate(subscription.trial_ends_at)} />
            )}
            {subscription.canceled_at && (
              <Info label="Cancelada em" value={formatDate(subscription.canceled_at)} />
            )}
          </div>
        )}

        {subscription?.cancel_at_period_end && (
          <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100">
            <CalendarClock className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              Cancelamento agendado: o acesso ao plano será encerrado em{' '}
              <strong>{formatDate(subscription.current_period_end)}</strong>.
            </div>
          </div>
        )}

        {pending && (
          <div className="flex items-start gap-2 p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100">
            <CalendarClock className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              Mudança de plano agendada para <strong>{pending.new_plan_code}</strong> em{' '}
              <strong>{formatDate(pending.effective_at)}</strong>.
            </div>
          </div>
        )}

        {subscription?.status === 'past_due' && (
          <div className="flex items-start gap-2 p-3 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              Há uma fatura vencida. Regularize o pagamento para evitar a suspensão da conta.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
