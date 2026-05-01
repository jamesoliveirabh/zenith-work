import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, AlertTriangle, RotateCcw, Users, XCircle, DollarSign } from 'lucide-react';
import { formatMoney } from '@/lib/billing/format';
import type { AdminBillingMetrics } from '@/types/admin-billing';

const Tile = ({ icon: Icon, label, value, tone }: {
  icon: typeof Users; label: string; value: string | number; tone?: 'warn' | 'danger' | 'ok';
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <Icon className={
          tone === 'danger' ? 'h-5 w-5 text-destructive'
          : tone === 'warn' ? 'h-5 w-5 text-amber-500'
          : tone === 'ok' ? 'h-5 w-5 text-emerald-500'
          : 'h-5 w-5 text-muted-foreground'
        } />
      </div>
    </CardContent>
  </Card>
);

export function AdminMetricsTiles({ metrics, isLoading }: {
  metrics?: AdminBillingMetrics; isLoading: boolean;
}) {
  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Tile icon={Users} label="Contas" value={metrics.total_accounts} />
      <Tile icon={DollarSign} label="MRR (mock)" value={formatMoney(metrics.mrr_cents_estimate)} tone="ok" />
      <Tile icon={AlertTriangle} label="Past due" value={metrics.past_due} tone="warn" />
      <Tile icon={Activity} label="Dunning aberto" value={metrics.open_dunning_cases} tone="danger" />
      <Tile icon={XCircle} label={`Cancel. ${metrics.window_days}d`} value={metrics.recent_cancellations} />
      <Tile icon={RotateCcw} label={`Recovers ${metrics.window_days}d`} value={metrics.recent_recoveries} tone="ok" />
    </div>
  );
}
