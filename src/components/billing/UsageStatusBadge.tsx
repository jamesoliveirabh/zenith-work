import { Badge } from '@/components/ui/badge';
import type { UsageStatus } from '@/types/billing';

const LABELS: Record<UsageStatus, string> = {
  ok: 'OK',
  warning: 'Atenção',
  critical: 'Limite atingido',
  unlimited: 'Ilimitado',
};

const STYLES: Record<UsageStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  unlimited: 'bg-muted text-muted-foreground border-border',
};

export function UsageStatusBadge({ status }: { status: UsageStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status]}
    </Badge>
  );
}
