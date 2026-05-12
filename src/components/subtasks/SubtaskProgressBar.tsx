import { motion } from "framer-motion";
import { useProgressPercentage } from "@/hooks/useSubtasks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string | undefined;
  className?: string;
  showLabel?: boolean;
}

export function SubtaskProgressBar({ taskId, className, showLabel = true }: Props) {
  const { data, isLoading } = useProgressPercentage(taskId);

  if (isLoading) return <Skeleton className={cn("h-2 w-full", className)} />;
  if (!data || data.total === 0) return null;

  const { completed, total, percentage } = data;

  return (
    <div className={cn("space-y-1.5", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {completed}/{total} completas
          </span>
          <span className="font-medium">{percentage}%</span>
        </div>
      )}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default SubtaskProgressBar;
