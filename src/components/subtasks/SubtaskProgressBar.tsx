import { useState } from "react";
import { useProgressPercentage } from "@/hooks/useSubtasks";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string | undefined;
  showPercentage?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const SIZE_BAR: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

const SIZE_TEXT: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

function colorFor(percentage: number) {
  if (percentage < 33) return "bg-red-500";
  if (percentage < 66) return "bg-yellow-500";
  return "bg-green-500";
}

export function SubtaskProgressBar({
  taskId,
  showPercentage = true,
  showLabel = true,
  size = "md",
  animated = true,
  className,
}: Props) {
  const { data, isLoading } = useProgressPercentage(taskId);
  const [hover, setHover] = useState(false);

  if (isLoading) {
    return <Skeleton className={cn(SIZE_BAR[size], "w-full", className)} />;
  }

  if (!data || data.total === 0) {
    return (
      <span className={cn("text-muted-foreground", SIZE_TEXT[size], className)}>
        Sem subtasks
      </span>
    );
  }

  const { completed, total, percentage } = data;
  const color = colorFor(percentage);

  const bar = (
    <div
      className={cn("space-y-1.5", className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          SIZE_BAR[size],
        )}
      >
        <div
          className={cn(
            "h-full rounded-full",
            color,
            animated && "transition-all duration-500 ease-out",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div
          className={cn(
            "flex items-center justify-between text-muted-foreground",
            SIZE_TEXT[size],
          )}
        >
          <span>
            {completed}/{total} completas
          </span>
          {showPercentage && <span className="font-medium">{percentage}%</span>}
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip open={hover}>
        <TooltipTrigger asChild>
          <div className="w-full">{bar}</div>
        </TooltipTrigger>
        <TooltipContent>
          {completed} de {total} subtasks concluídas
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default SubtaskProgressBar;
