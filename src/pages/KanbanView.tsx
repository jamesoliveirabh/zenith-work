import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Calendar, CalendarDays, GanttChart, LayoutList, Loader2, Plus, Table as TableIcon, Trello } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { TaskDependencyIndicator } from "@/components/dependencies/TaskDependencyIndicator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ListFilterBar, applyFilters, EMPTY_FILTERS, type ListFilters } from "@/components/ListFilterBar";
import { useStatuses } from "@/hooks/useStatuses";
import { useCreateTask, useReorderTasks, useTasks } from "@/hooks/useTasks";
import { useListMembers } from "@/hooks/useListMembers";
import type { Priority, Status, Task } from "@/types/task";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const priorityClass: Record<Priority, string> = {
  low: "bg-priority-low/15 text-priority-low border-priority-low/30",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
  urgent: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30",
};
const priorityLabel: Record<Priority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};

function TaskCard({ task, onOpen }: { task: Task; onOpen?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(task.id)}
      className={cn(
        "rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors",
        isDragging && "opacity-40"
      )}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      {task.description_text && (
        <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-2">{task.description_text}</p>
      )}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={cn("font-normal text-[10px] py-0 h-5", priorityClass[task.priority])}>
          {priorityLabel[task.priority]}
        </Badge>
        <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <TaskDependencyIndicator taskId={task.id} taskTitle={task.title} compact />
        </span>
        {task.due_date && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(new Date(task.due_date), "dd MMM")}
          </span>
        )}
        {task.assignees.length > 0 && (
          <div className="ml-auto flex items-center" onClick={(e) => e.stopPropagation()}>
            <AssigneeSelect
              members={task.assignees}
              selectedIds={task.assignees.map((a) => a.id)}
              onAdd={() => {}}
              onRemove={() => {}}
              disabled
              maxVisible={3}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Column({
  status, tasks, onAddTask, onOpenTask,
}: {
  status: Status;
  tasks: Task[];
  onAddTask: (statusId: string, title: string) => Promise<void>;
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: status.id,
    data: { type: "column", statusId: status.id },
  });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  return (
    <div className="flex flex-col w-72 shrink-0 rounded-lg bg-muted/40 border h-fit max-h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color ?? "#94a3b8" }} />
        <h3 className="text-sm font-medium flex-1 truncate">{status.name}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        <button
          onClick={() => setAdding(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Adicionar tarefa"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 p-2 min-h-[80px] overflow-y-auto transition-colors",
          isOver && "bg-accent/40"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <TaskCard key={t.id} task={t} onOpen={onOpenTask} />)}
        </SortableContext>

        {adding ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              await onAddTask(status.id, title.trim());
              setTitle("");
              setAdding(false);
            }}
            className="space-y-1.5"
          >
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da tarefa"
              className="h-8 text-sm"
              onBlur={() => { if (!title.trim()) setAdding(false); }}
            />
            <div className="flex gap-1">
              <Button type="submit" size="sm" className="h-7">Adicionar</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md py-1.5 px-2 hover:bg-accent transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
          </button>
        )}
      </div>
    </div>
  );
}

export default function KanbanView() {
  const { listId } = useParams<{ listId: string }>();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);

  const { data: listData } = useQuery({
    queryKey: ["list-breadcrumb", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data } = await supabase
        .from("lists")
        .select("name, spaces(name, teams(name))")
        .eq("id", listId!)
        .maybeSingle();
      const space = (data as { spaces?: { name?: string; teams?: { name?: string } | null } | null } | null)?.spaces;
      return {
        listName: data?.name ?? "",
        spaceName: space?.name ?? "",
        teamName: space?.teams?.name ?? "",
      };
    },
  });
  const listName = listData?.listName ?? "";
  const spaceName = listData?.spaceName ?? "";
  const teamName = listData?.teamName ?? "";

  const { data: statuses = [], isLoading: statusesLoading } = useStatuses(listId);
  const { data: tasks = [], isLoading: tasksLoading } = useTasks(listId);
  const { data: members = [] } = useListMembers(current?.id);

  const createTask = useCreateTask(listId ?? "");
  const reorderTasks = useReorderTasks(listId ?? "");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => (t.tags ?? []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tasks]);

  const visibleTasks = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  const doneCount = useMemo(() => {
    const doneIds = new Set(statuses.filter((s) => s.is_done).map((s) => s.id));
    return tasks.filter((t) => t.status_id && doneIds.has(t.status_id)).length;
  }, [tasks, statuses]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    statuses.forEach((s) => { map[s.id] = []; });
    visibleTasks.forEach((t) => {
      const sid = t.status_id ?? statuses[0]?.id;
      if (sid && map[sid]) map[sid].push(t);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [visibleTasks, statuses]);

  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, Task["assignees"][number]>();
    tasks.forEach((t) => t.assignees.forEach((a) => map.set(a.id, a)));
    return Array.from(map.values());
  }, [tasks]);

  const handleAddTask = async (statusId: string, title: string): Promise<void> => {
    if (!current || !listId || !user) return;
    const sameCol = tasksByStatus[statusId] ?? [];
    await createTask.mutateAsync({
      workspace_id: current.id,
      title,
      status_id: statusId,
      created_by: user.id,
      position: sameCol.length,
    });
  };

  const handleQuickAdd = async () => {
    if (!current || !listId || !user || statuses.length === 0) return;
    await createTask.mutateAsync({
      workspace_id: current.id,
      title: "Nova tarefa",
      status_id: statuses[0].id,
      created_by: user.id,
      position: tasksByStatus[statuses[0].id]?.length ?? 0,
    });
  };

  const onDragStart = (e: DragStartEvent) => {
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setActiveTask(t);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeT = tasks.find((t) => t.id === activeId);
    if (!activeT) return;

    const overData = over.data.current as { type?: string; statusId?: string; task?: Task } | undefined;
    const destStatusId =
      overData?.type === "column"
        ? overData.statusId!
        : (tasks.find((t) => t.id === overId)?.status_id ?? activeT.status_id);
    if (!destStatusId) return;

    const sourceCol = (tasksByStatus[activeT.status_id ?? ""] ?? []).filter((t) => t.id !== activeId);
    let destCol = (destStatusId === activeT.status_id ? sourceCol : [...(tasksByStatus[destStatusId] ?? [])]);

    let insertIndex = destCol.length;
    if (overData?.type !== "column") {
      const idx = destCol.findIndex((t) => t.id === overId);
      if (idx >= 0) insertIndex = idx;
    }
    destCol = [
      ...destCol.slice(0, insertIndex),
      { ...activeT, status_id: destStatusId },
      ...destCol.slice(insertIndex),
    ];

    if (destStatusId === activeT.status_id) {
      const orig = tasksByStatus[destStatusId] ?? [];
      const from = orig.findIndex((t) => t.id === activeId);
      const to = orig.findIndex((t) => t.id === overId);
      if (from >= 0 && to >= 0) destCol = arrayMove(orig, from, to);
    }

    const updates: { id: string; position: number; status_id?: string | null }[] =
      destCol.map((t, i) => ({ id: t.id, position: i, status_id: destStatusId }));
    if (destStatusId !== activeT.status_id) {
      sourceCol.forEach((t, i) => updates.push({ id: t.id, position: i }));
    }

    // If moving INTO a "done" column from a non-done column, check blockers.
    const destIsDone = !!statuses.find((s) => s.id === destStatusId)?.is_done;
    const sourceIsDone = !!statuses.find((s) => s.id === activeT.status_id)?.is_done;
    if (destIsDone && !sourceIsDone) {
      const { data: blockers } = await supabase
        .from("task_dependencies")
        .select("source_task_id, target_task_id, dependency_type")
        .or(
          `and(target_task_id.eq.${activeId},dependency_type.eq.blocks),` +
          `and(source_task_id.eq.${activeId},dependency_type.eq.blocked_by)`,
        );
      if ((blockers ?? []).length > 0) {
        const firstBlockerId =
          blockers![0].dependency_type === "blocks"
            ? blockers![0].source_task_id
            : blockers![0].target_task_id;
        setPendingMove({ updates, blockerTaskId: firstBlockerId });
        return;
      }
    }

    reorderTasks.mutate(updates);
  };

  if (statusesLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const breadcrumb = [teamName, spaceName].filter(Boolean).join(" / ").toUpperCase();

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 lg:px-8 pt-6 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {breadcrumb && (
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground mb-1">
                {breadcrumb}
              </p>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{listName || "Lista"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
              {doneCount > 0 && <> · {doneCount} concluída{doneCount === 1 ? "" : "s"}</>}
            </p>
          </div>
          <div className="flex gap-1 rounded-md border p-0.5">
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}`}><LayoutList className="h-4 w-4 mr-1.5" />Lista</Link>
            </Button>
            <Button variant="secondary" size="sm" className="h-8">
              <Trello className="h-4 w-4 mr-1.5" />Kanban
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/table`}><TableIcon className="h-4 w-4 mr-1.5" />Tabela</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/calendar`}><CalendarDays className="h-4 w-4 mr-1.5" />Calendário</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/gantt`}><GanttChart className="h-4 w-4 mr-1.5" />Gantt</Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            {listId && (
              <ListFilterBar
                listId={listId}
                filters={filters}
                onChange={setFilters}
                statuses={statuses}
                members={members.map((m) => ({ user_id: m.id, name: m.display_name || m.email?.split("@")[0] || "—" }))}
                availableTags={availableTags}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {uniqueAssignees.length > 0 && (
              <AssigneeSelect
                members={uniqueAssignees}
                selectedIds={uniqueAssignees.map((a) => a.id)}
                onAdd={() => {}}
                onRemove={() => {}}
                disabled
                maxVisible={3}
              />
            )}
            <Button size="sm" onClick={handleQuickAdd} disabled={createTask.isPending || statuses.length === 0}>
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar tarefa
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 lg:px-8 pb-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 h-full items-start">
            <SortableContext items={statuses.map((s) => s.id)}>
              {statuses.map((s) => (
                <Column
                  key={s.id}
                  status={s}
                  tasks={tasksByStatus[s.id] ?? []}
                  onAddTask={handleAddTask}
                  onOpenTask={setOpenTaskId}
                />
              ))}
            </SortableContext>
          </div>
          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} />}
          </DragOverlay>
        </DndContext>
      </div>

      <TaskDetailDialog
        taskId={openTaskId}
        listId={listId ?? ""}
        doneStatusId={statuses.find((s) => s.is_done)?.id ?? null}
        open={!!openTaskId}
        onOpenChange={(o) => { if (!o) setOpenTaskId(null); }}
      />
    </div>
  );
}
