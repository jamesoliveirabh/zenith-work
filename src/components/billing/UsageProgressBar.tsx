import { cn } from '@/lib/utils';
import type { UsageStatus } from '@/types/billing';

interface Props {
  pct: number | null;
  status: UsageStatus;
}

const COLORS: Record<UsageStatus, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-rose-500',
  unlimited: 'bg-muted-foreground/40',
};

export function UsageProgressBar({ pct, status }: Props) {
  const value = pct == null ? 100 : Math.max(0, Math.min(100, pct));
  const indeterminate = pct == null;

  return (
    <div
      className="h-2 w-full rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full transition-all rounded-full',
          COLORS[status],
          indeterminate && 'opacity-30',
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
