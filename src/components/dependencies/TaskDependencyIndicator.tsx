import { useCallback, useState } from "react";
import { AlertCircle, Link2, Lock, Repeat } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTaskDependencies } from "@/hooks/useTaskDependencies";
import { DependencyViewer } from "./DependencyViewer";

type Size = "sm" | "md" | "lg";

interface Props {
  taskId: string;
  taskTitle?: string;
  compact?: boolean;
  size?: Size;
  /** Optional click handler. If omitted, the built-in DependencyViewer opens. */
  onBadgeClick?: (taskId: string) => void;
}

const SIZE_CLS: Record<Size, { badge: string; icon: string; gap: string }> = {
  sm: { badge: "h-5 px-2 text-[10px]", icon: "h-3 w-3", gap: "gap-1" },
  md: { badge: "h-6 px-2.5 text-xs", icon: "h-3.5 w-3.5", gap: "gap-1.5" },
  lg: { badge: "h-7 px-3 text-sm", icon: "h-4 w-4", gap: "gap-2" },
};

function NamesList({ items, label }: { items: { title: string }[]; label: string }) {
  return (
    <div className="space-y-0.5 max-w-[240px]">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <ul className="space-y-0.5">
        {items.slice(0, 6).map((t, i) => (
          <li key={i} className="text-xs truncate">- {t.title}</li>
        ))}
        {items.length > 6 && (
          <li className="text-[11px] text-muted-foreground">+{items.length - 6} mais</li>
        )}
      </ul>
    </div>
  );
}

export function TaskDependencyIndicator({
  taskId,
  taskTitle,
  compact = false,
  size = "md",
  onBadgeClick,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useTaskDependencies(taskId);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onBadgeClick) onBadgeClick(taskId);
      else setOpen(true);
    },
    [onBadgeClick, taskId],
  );

  if (isLoading) {
    return <Skeleton className={cn("rounded-full", SIZE_CLS[size].badge, "w-24")} />;
  }
  if (isError) {
    return (
      <span className="inline-flex items-center text-destructive" aria-label="Erro ao carregar dependências">
        <AlertCircle className={SIZE_CLS[size].icon} />
      </span>
    );
  }

  const blockedBy = data?.blockedBy ?? [];
  const blocks = data?.blocks ?? [];
  const relatedTo = data?.relatedTo ?? [];

  const blockedByCount = blockedBy.length;
  const blocksCount = blocks.length;
  const relatedCount = relatedTo.length;

  if (blockedByCount + blocksCount + relatedCount === 0) return null;

  const sz = SIZE_CLS[size];
  const baseBadge = cn(
    "inline-flex items-center rounded-full font-medium border transition-colors cursor-pointer pointer-events-auto",
    sz.badge,
    sz.gap,
  );

  const badges: React.ReactNode[] = [];

  if (blockedByCount > 0) {
    badges.push(
      <Tooltip key="blocked-by">
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              baseBadge,
              "bg-red-100 text-red-700 border-red-200 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
            )}
            aria-label={`Bloqueada por ${blockedByCount}`}
          >
            <Lock className={sz.icon} />
            <span>Bloqueada por {blockedByCount}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <NamesList items={blockedBy} label="Bloqueada por:" />
        </TooltipContent>
      </Tooltip>,
    );
  }

  if (blocksCount > 0) {
    badges.push(
      <Tooltip key="blocks">
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              baseBadge,
              "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60",
            )}
            aria-label={`Bloqueia ${blocksCount}`}
          >
            <Link2 className={sz.icon} />
            <span>Bloqueia {blocksCount}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <NamesList items={blocks} label="Bloqueia:" />
        </TooltipContent>
      </Tooltip>,
    );
  }

  if (relatedCount > 0) {
    badges.push(
      <Tooltip key="related">
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              baseBadge,
              "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 dark:bg-muted dark:text-muted-foreground dark:border-border",
            )}
            aria-label={`${relatedCount} relacionada`}
          >
            <Repeat className={sz.icon} />
            <span>
              {relatedCount} relacionada{relatedCount > 1 ? "s" : ""}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <NamesList items={relatedTo} label="Relacionada:" />
        </TooltipContent>
      </Tooltip>,
    );
  }

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(
            "inline-flex flex-wrap items-center",
            compact ? "gap-1" : "gap-2",
          )}
        >
          {badges}
        </div>
      </TooltipProvider>

      {!onBadgeClick && (
        <DependencyViewer
          taskId={taskId}
          taskTitle={taskTitle}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
