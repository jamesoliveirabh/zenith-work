import { useEffect, useMemo, useState } from "react";
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
import { Calendar, LayoutList, Loader2, Plus, Table as TableIcon, Trello } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { AssigneeSelect, type AssigneeMember } from "@/components/AssigneeSelect";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";
interface Status { id: string; name: string; color: string | null; is_done: boolean; position: number; }
interface Task {
  id: string; title: string; status_id: string | null; priority: Priority;
  due_date: string | null; position: number;
  description_text: string | null;
  assignees: AssigneeMember[];
}

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
  const [listName, setListName] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    if (!listId) return;
    setLoading(true);
    const [{ data: list }, { data: st }, { data: tk }] = await Promise.all([
      supabase.from("lists").select("name").eq("id", listId).maybeSingle(),
      supabase.from("status_columns").select("id,name,color,is_done,position").eq("list_id", listId).order("position"),
      supabase.from("tasks").select("id,title,status_id,priority,due_date,position,description_text")
        .eq("list_id", listId).is("parent_task_id", null).order("position"),
    ]);
    setListName(list?.name ?? "");
    setStatuses(st ?? []);

    const taskList = (tk ?? []) as Omit<Task, "assignees">[];
    let assigneesByTask: Record<string, AssigneeMember[]> = {};
    if (taskList.length > 0) {
      const { data: ta } = await supabase
        .from("task_assignees").select("task_id,user_id")
        .in("task_id", taskList.map((t) => t.id));
      const userIds = Array.from(new Set((ta ?? []).map((r) => r.user_id)));
      let profMap: Record<string, AssigneeMember> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles").select("id,display_name,avatar_url,email").in("id", userIds);
        profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p as AssigneeMember]));
      }
      (ta ?? []).forEach((r) => {
        const prof = profMap[r.user_id];
        if (prof) (assigneesByTask[r.task_id] ||= []).push(prof);
      });
    }
    setTasks(taskList.map((t) => ({ ...t, assignees: assigneesByTask[t.id] ?? [] })));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [listId]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    statuses.forEach((s) => { map[s.id] = []; });
    tasks.forEach((t) => {
      const sid = t.status_id ?? statuses[0]?.id;
      if (sid && map[sid]) map[sid].push(t);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [tasks, statuses]);

  const handleAddTask = async (statusId: string, title: string): Promise<void> => {
    if (!current || !listId || !user) return;
    const sameCol = tasksByStatus[statusId] ?? [];
    const { data, error } = await supabase.from("tasks").insert({
      list_id: listId, workspace_id: current.id, status_id: statusId,
      title, created_by: user.id, position: sameCol.length,
    }).select("id,title,status_id,priority,due_date,position,description_text").single();
    if (error) { toast.error(error.message); return; }
    if (data) setTasks((p) => [...p, { ...(data as Omit<Task, "assignees">), assignees: [] }]);
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

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // Determine destination status: if over a column, use it; if over a task, use that task's status
    const overData = over.data.current as { type?: string; statusId?: string; task?: Task } | undefined;
    const destStatusId =
      overData?.type === "column"
        ? overData.statusId!
        : (tasks.find((t) => t.id === overId)?.status_id ?? activeTask.status_id);
    if (!destStatusId) return;

    // Build new ordered lists
    const sourceCol = (tasksByStatus[activeTask.status_id ?? ""] ?? []).filter((t) => t.id !== activeId);
    let destCol = (destStatusId === activeTask.status_id ? sourceCol : [...(tasksByStatus[destStatusId] ?? [])]);

    let insertIndex = destCol.length;
    if (overData?.type !== "column") {
      const idx = destCol.findIndex((t) => t.id === overId);
      if (idx >= 0) insertIndex = idx;
    }
    destCol = [
      ...destCol.slice(0, insertIndex),
      { ...activeTask, status_id: destStatusId },
      ...destCol.slice(insertIndex),
    ];

    // Reposition within same col uses arrayMove for clarity
    if (destStatusId === activeTask.status_id) {
      const orig = tasksByStatus[destStatusId] ?? [];
      const from = orig.findIndex((t) => t.id === activeId);
      const to = orig.findIndex((t) => t.id === overId);
      if (from >= 0 && to >= 0) destCol = arrayMove(orig, from, to);
    }

    // Optimistic update
    const updates = destCol.map((t, i) => ({ ...t, position: i, status_id: destStatusId }));
    setTasks((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      updates.forEach((u) => map.set(u.id, { ...map.get(u.id)!, position: u.position, status_id: u.status_id }));
      // Reset positions in source col if changed
      if (destStatusId !== activeTask.status_id) {
        sourceCol.forEach((t, i) => map.set(t.id, { ...map.get(t.id)!, position: i }));
      }
      return Array.from(map.values());
    });

    // Persist (one update per affected task)
    const writes = updates.map((u) =>
      supabase.from("tasks").update({ status_id: u.status_id, position: u.position }).eq("id", u.id)
    );
    if (destStatusId !== activeTask.status_id) {
      sourceCol.forEach((t, i) => writes.push(
        supabase.from("tasks").update({ position: i }).eq("id", t.id)
      ));
    }
    const results = await Promise.all(writes);
    if (results.some((r) => r.error)) {
      toast.error("Falha ao salvar ordem");
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 lg:px-8 pt-6 pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{listName || "Lista"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
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
