import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTaskDependencies } from "@/hooks/useTaskDependencies";
import { DependencyViewer } from "./DependencyViewer";

interface Props {
  taskId: string;
  /** Compact = small inline pills (for cards). Default = larger (for detail view). */
  compact?: boolean;
  /** Optional task title used by the viewer dialog header. */
  taskTitle?: string;
  /** When true, clicking opens the viewer. Defaults to true. */
  interactive?: boolean;
}

function NamesTooltip({ items, label }: { items: { title: string }[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <ul className="space-y-0.5">
        {items.slice(0, 6).map((t, i) => (
          <li key={i} className="text-xs">• {t.title}</li>
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
  compact = false,
  taskTitle,
  interactive = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data } = useTaskDependencies(taskId);

  const blockedBy = data?.blockedBy ?? [];
  const blocks = data?.blocks ?? [];
  const total = blockedBy.length + blocks.length + (data?.relatedTo.length ?? 0);

  const sizeCls = compact ? "h-5 px-1.5 text-[10px] gap-1" : "h-6 px-2 text-xs gap-1.5";
  const iconCls = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  const labels = useMemo(() => {
    const blockedLabel =
      blockedBy.length === 0
        ? null
        : blockedBy.length === 1
        ? `Bloqueada por: ${blockedBy[0].title}`
        : `Bloqueada por ${blockedBy.length} tasks`;
    const blocksLabel =
      blocks.length === 0
        ? null
        : blocks.length === 1
        ? `Bloqueia: ${blocks[0].title}`
        : `Bloqueia ${blocks.length} tasks`;
    return { blockedLabel, blocksLabel };
  }, [blockedBy, blocks]);

  if (total === 0) return null;

  const handleOpen = (e: React.MouseEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div className={cn("inline-flex items-center gap-1 flex-wrap")}>
          {labels.blockedLabel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleOpen}
                  className={cn(
                    "inline-flex items-center rounded-md border font-medium transition-colors",
                    "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
                    interactive ? "cursor-pointer" : "cursor-default",
                    sizeCls,
                  )}
                  aria-label={labels.blockedLabel}
                >
                  <AlertCircle className={iconCls} />
                  <span className="truncate max-w-[160px]">{labels.blockedLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                <NamesTooltip items={blockedBy} label="Bloqueada por" />
              </TooltipContent>
            </Tooltip>
          )}
          {labels.blocksLabel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleOpen}
                  className={cn(
                    "inline-flex items-center rounded-md border font-medium transition-colors",
                    "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
                    interactive ? "cursor-pointer" : "cursor-default",
                    sizeCls,
                  )}
                  aria-label={labels.blocksLabel}
                >
                  <ArrowRight className={iconCls} />
                  <span className="truncate max-w-[160px]">{labels.blocksLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                <NamesTooltip items={blocks} label="Bloqueia" />
              </TooltipContent>
            </Tooltip>
          )}
          {labels.blockedLabel === null && labels.blocksLabel === null && (
            <Badge
              variant="secondary"
              className={cn("cursor-pointer", sizeCls)}
              onClick={handleOpen}
            >
              <Link2 className={iconCls} />
              {data?.relatedTo.length ?? 0} relacionada{(data?.relatedTo.length ?? 0) > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </TooltipProvider>

      {interactive && (
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
