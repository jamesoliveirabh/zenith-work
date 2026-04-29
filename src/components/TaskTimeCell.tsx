import { cn } from "@/lib/utils";
import { formatDuration } from "@/hooks/useTimeTracking";
import { Clock } from "lucide-react";

interface Props {
  trackedSeconds: number;
  estimateSeconds?: number | null;
  className?: string;
}

/** Compact time tracking indicator for list/table cells. */
export function TaskTimeCell({ trackedSeconds, estimateSeconds, className }: Props) {
  if (!trackedSeconds && !estimateSeconds) {
    return <span className={cn("text-xs text-muted-foreground/60", className)}>—</span>;
  }
  const pct =
    estimateSeconds && estimateSeconds > 0
      ? Math.min(200, Math.round((trackedSeconds / estimateSeconds) * 100))
      : null;
  let barColor = "bg-priority-low";
  if (pct !== null) {
    if (pct > 100) barColor = "bg-destructive";
    else if (pct >= 80) barColor = "bg-priority-medium";
  }
  const over = pct !== null && pct > 100;
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
      <div className="flex items-center gap-1 text-xs tabular-nums">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className={cn(over && "text-destructive font-medium")}>
          {formatDuration(trackedSeconds)}
        </span>
        {estimateSeconds ? (
          <span className="text-muted-foreground">/ {formatDuration(estimateSeconds)}</span>
        ) : null}
      </div>
      {pct !== null && (
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full transition-all", barColor)}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}
