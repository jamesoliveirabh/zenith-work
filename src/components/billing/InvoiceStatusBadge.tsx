import { Badge } from '@/components/ui/badge';
import type { InvoiceStatus } from '@/types/billing';

const LABELS: Record<InvoiceStatus, string> = {
  draft: 'Rascunho',
  open: 'Em aberto',
  paid: 'Paga',
  void: 'Anulada',
  uncollectible: 'Inadimplente',
};

const STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  void: 'bg-muted text-muted-foreground border-border',
  uncollectible: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
