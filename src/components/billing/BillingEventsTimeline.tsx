import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/billing/format';
import type { BillingEvent } from '@/hooks/useBillingReads';
import { Activity } from 'lucide-react';

const EVENT_LABELS: Record<string, string> = {
  'subscription.created': 'Assinatura criada',
  'subscription.plan_changed': 'Plano alterado',
  'subscription.cancel_scheduled': 'Cancelamento agendado',
  'subscription.resumed': 'Assinatura reativada',
  'subscription.canceled': 'Assinatura cancelada',
  'invoice.created': 'Fatura gerada',
  'invoice.paid': 'Fatura paga',
  'invoice.payment_failed': 'Falha de pagamento',
};

function summarize(payload: Record<string, unknown>): string {
  if (!payload) return '';
  const keys = ['plan_code', 'new_plan_code', 'reason', 'mode', 'amount_due_cents'];
  const parts: string[] = [];
  for (const k of keys) {
    if (payload[k] != null) parts.push(`${k}: ${String(payload[k])}`);
  }
  return parts.join(' · ');
}

export function BillingEventsTimeline({
  events, loading,
}: { events: BillingEvent[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        Nenhum evento de cobrança registrado.
      </div>
    );
  }

  return (
    <ol className="relative border-l border-border ml-2 space-y-4">
      {events.map((ev) => (
        <li key={ev.id} className="ml-4">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {EVENT_LABELS[ev.event_type] ?? ev.event_type}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(ev.created_at)}
            </span>
          </div>
          {summarize(ev.payload) && (
            <p className="text-xs text-muted-foreground mt-0.5 break-all">
              {summarize(ev.payload)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
