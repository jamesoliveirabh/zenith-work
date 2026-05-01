import { Badge } from '@/components/ui/badge';
import type { SubscriptionStatus } from '@/types/billing';

const LABELS: Record<SubscriptionStatus, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
};

const STYLES: Record<SubscriptionStatus, string> = {
  trialing: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  past_due: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  canceled: 'bg-muted text-muted-foreground border-border',
  incomplete: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
