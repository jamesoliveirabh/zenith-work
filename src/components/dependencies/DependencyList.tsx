import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDeleteDependency,
  useTaskDependencies,
  type RelatedTaskRef,
} from "@/hooks/useTaskDependencies";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types/task";

interface Props {
  taskId: string;
}

interface EnrichedTask {
  priority: Priority | null;
  status_name: string | null;
  status_color: string | null;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const PRIORITY_CLS: Record<Priority, string> = {
  urgent: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  low: "bg-priority-low/15 text-priority-low border-priority-low/30",
};

function useEnrichedTasks(taskIds: string[]) {
  const key = [...taskIds].sort().join(",");
  return useQuery({
    queryKey: ["dependency-task-meta", key],
    enabled: taskIds.length > 0,
    queryFn: async (): Promise<Record<string, EnrichedTask>> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, priority, status:status_columns!tasks_status_id_fkey(name,color)")
        .in("id", taskIds);
      if (error) throw error;
      const out: Record<string, EnrichedTask> = {};
      for (const r of (data ?? []) as Array<{
        id: string;
        priority: Priority | null;
        status: { name: string | null; color: string | null } | null;
      }>) {
        out[r.id] = {
          priority: r.priority,
          status_name: r.status?.name ?? null,
          status_color: r.status?.color ?? null,
        };
      }
      return out;
    },
  });
}

function Row({
  ref_,
  meta,
  canDelete,
  onDelete,
  deleting,
}: {
  ref_: RelatedTaskRef;
  meta?: EnrichedTask;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 group">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{ref_.title}</p>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {meta?.status_name && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
              style={
                meta.status_color
                  ? { borderColor: meta.status_color, color: meta.status_color }
                  : undefined
              }
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: meta.status_color ?? "currentColor" }}
              />
              {meta.status_name}
            </span>
          )}
          {meta?.priority && (
            <Badge
              variant="outline"
              className={cn("text-[10px] h-4 px-1.5", PRIORITY_CLS[meta.priority])}
            >
              {PRIORITY_LABEL[meta.priority]}
            </Badge>
          )}
        </div>
      </div>
      {canDelete && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Remover dependência"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          )}
        </Button>
      )}
    </li>
  );
}

function Empty() {
  return (
    <p className="text-sm text-muted-foreground text-center py-6">Nenhuma dependência</p>
  );
}

export function DependencyList({ taskId }: Props) {
  const { user } = useAuth();
  const { data, isLoading } = useTaskDependencies(taskId);
  const del = useDeleteDependency(undefined);

  const allIds = useMemo(() => {
    if (!data) return [];
    return Array.from(
      new Set([
        ...data.blocks.map((r) => r.taskId),
        ...data.blockedBy.map((r) => r.taskId),
        ...data.relatedTo.map((r) => r.taskId),
      ]),
    );
  }, [data]);
  const { data: meta = {} } = useEnrichedTasks(allIds);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderList = (items: RelatedTaskRef[]) =>
    items.length === 0 ? (
      <Empty />
    ) : (
      <ul className="space-y-1.5">
        {items.map((r) => (
          <Row
            key={r.dependencyId}
            ref_={r}
            meta={meta[r.taskId]}
            canDelete={r.createdBy === user?.id}
            deleting={del.isPending && del.variables?.dependencyId === r.dependencyId}
            onDelete={() =>
              del.mutate({
                dependencyId: r.dependencyId,
                sourceTaskId: taskId,
                targetTaskId: r.taskId,
              })
            }
          />
        ))}
      </ul>
    );

  return (
    <Tabs defaultValue="blocks" className="w-full">
      <TabsList className="grid grid-cols-3 w-full">
        <TabsTrigger value="blocks">
          Bloqueia
          {(data?.blocks.length ?? 0) > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              {data!.blocks.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="blockedBy">
          Bloqueada por
          {(data?.blockedBy.length ?? 0) > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              {data!.blockedBy.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="relatedTo">
          Relacionada
          {(data?.relatedTo.length ?? 0) > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              {data!.relatedTo.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="blocks" className="mt-3">{renderList(data?.blocks ?? [])}</TabsContent>
      <TabsContent value="blockedBy" className="mt-3">{renderList(data?.blockedBy ?? [])}</TabsContent>
      <TabsContent value="relatedTo" className="mt-3">{renderList(data?.relatedTo ?? [])}</TabsContent>
    </Tabs>
  );
}
