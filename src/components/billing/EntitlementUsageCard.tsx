import { Card, CardContent } from '@/components/ui/card';
import { UsageProgressBar } from './UsageProgressBar';
import { UsageStatusBadge } from './UsageStatusBadge';
import { formatUsageValue } from '@/lib/billing/usage';
import type { UsageItem } from '@/types/billing';

export function EntitlementUsageCard({ item }: { item: UsageItem }) {
  const isUnlimited = item.status === 'unlimited';

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{item.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {isUnlimited
                ? `${item.currentUsage}${item.unit ? ` ${item.unit}` : ''} usados · Ilimitado`
                : formatUsageValue(item)}
            </div>
          </div>
          <UsageStatusBadge status={item.status} />
        </div>
        <UsageProgressBar pct={item.usagePct} status={item.status} />
        {item.usagePct != null && (
          <div className="text-[11px] text-muted-foreground text-right">
            {Math.round(item.usagePct)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}
