import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, isWeekend, startOfMonth,
  startOfWeek, startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, ChevronLeft, ChevronRight, LayoutList, Loader2, Plus,
  Table as TableIcon, Trello,
} from "lucide-react";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";
type ViewMode = "month" | "week" | "day";
interface Status { id: string; name: string; color: string | null; is_done: boolean; position: number; }
interface Task {
  id: string;
  title: string;
  status_id: string | null;
  priority: Priority;
  due_date: string | null;
}

const priorityColor: Record<Priority, string> = {
  low: "hsl(var(--priority-low))",
  medium: "hsl(var(--priority-medium))",
  high: "hsl(var(--priority-high))",
  urgent: "hsl(var(--priority-urgent))",
};

export default function CalendarView() {
  const { listId } = useParams<{ listId: string }>();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [listName, setListName] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showUndated, setShowUndated] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Auto-collapse to week on small screens
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < 768 && view === "month") setView("week");
    };
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
    // eslint-disable-next-line
  }, []);

  const load = async () => {
    if (!listId) return;
    setLoading(true);
    const [{ data: list }, { data: st }, { data: tk }] = await Promise.all([
      supabase.from("lists").select("name").eq("id", listId).maybeSingle(),
      supabase.from("status_columns").select("id,name,color,is_done,position").eq("list_id", listId).order("position"),
      supabase.from("tasks").select("id,title,status_id,priority,due_date")
        .eq("list_id", listId).is("parent_task_id", null),
    ]);
    setListName(list?.name ?? "");
    setStatuses(st ?? []);
    setTasks((tk ?? []) as Task[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [listId]);

  const defaultStatusId = useMemo(() => statuses[0]?.id ?? null, [statuses]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (!t.due_date) return;
      const key = format(new Date(t.due_date), "yyyy-MM-dd");
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    });
    return map;
  }, [tasks]);

  const undatedTasks = useMemo(() => tasks.filter((t) => !t.due_date), [tasks]);

  // Navigation
  const goPrev = () => {
    if (view === "month") setCursor((d) => addMonths(d, -1));
    else if (view === "week") setCursor((d) => addWeeks(d, -1));
    else setCursor((d) => addDays(d, -1));
  };
  const goNext = () => {
    if (view === "month") setCursor((d) => addMonths(d, 1));
    else if (view === "week") setCursor((d) => addWeeks(d, 1));
    else setCursor((d) => addDays(d, 1));
  };
  const goToday = () => setCursor(startOfDay(new Date()));

  const periodLabel = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy", { locale: ptBR });
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 0 });
      const e = endOfWeek(cursor, { weekStartsOn: 0 });
      return `${format(s, "d MMM", { locale: ptBR })} – ${format(e, "d MMM yyyy", { locale: ptBR })}`;
    }
    return format(cursor, "EEEE, d 'de' MMMM yyyy", { locale: ptBR });
  }, [view, cursor]);

  // Mutations
  const updateDueDate = async (taskId: string, dayISO: string | null, keepTime = true) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    let newDate: string | null = null;
    if (dayISO) {
      const day = new Date(dayISO);
      if (keepTime && t.due_date) {
        const orig = new Date(t.due_date);
        day.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      } else {
        day.setHours(9, 0, 0, 0);
      }
      newDate = day.toISOString();
    }
    setTasks((p) => p.map((x) => (x.id === taskId ? { ...x, due_date: newDate } : x)));
    const { error } = await supabase.from("tasks").update({ due_date: newDate }).eq("id", taskId);
    if (error) { toast.error(error.message); load(); }
    else toast.success("Data atualizada");
  };

  const createTaskOnDay = async (day: Date, title: string) => {
    if (!current || !listId || !user || !title.trim()) return;
    const due = new Date(day);
    due.setHours(9, 0, 0, 0);
    const { data, error } = await supabase.from("tasks").insert({
      list_id: listId,
      workspace_id: current.id,
      title: title.trim(),
      status_id: defaultStatusId,
      created_by: user.id,
      position: tasks.length,
      due_date: due.toISOString(),
    }).select("id,title,status_id,priority,due_date").single();
    if (error) return toast.error(error.message);
    if (data) setTasks((p) => [...p, data as Task]);
  };

  const onDragStart = (e: DragStartEvent) => {
    const t = tasks.find((x) => x.id === String(e.active.id));
    if (t) setActiveTask(t);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;
    const data = over.data.current as { day?: string; undated?: boolean } | undefined;
    if (data?.undated) {
      updateDueDate(String(active.id), null);
    } else if (data?.day) {
      updateDueDate(String(active.id), data.day);
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
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 lg:px-8 pt-6 pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{listName || "Lista"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border p-0.5">
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}`}><LayoutList className="h-4 w-4 mr-1.5" />Lista</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/kanban`}><Trello className="h-4 w-4 mr-1.5" />Kanban</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/table`}><TableIcon className="h-4 w-4 mr-1.5" />Tabela</Link>
            </Button>
            <Button variant="secondary" size="sm" className="h-8">
              <CalendarDays className="h-4 w-4 mr-1.5" />Calendário
            </Button>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 px-6 lg:px-8 pb-3">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8" onClick={goToday}>Hoje</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Próximo">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium ml-2 capitalize">{periodLabel}</span>
        </div>
        <div className="flex gap-1 rounded-md border p-0.5">
          {(["month", "week", "day"] as ViewMode[]).map((v) => (
            <Button
              key={v}
              variant={view === v ? "secondary" : "ghost"}
              size="sm" className="h-7"
              onClick={() => setView(v)}
            >
              {v === "month" ? "Mês" : v === "week" ? "Semana" : "Dia"}
            </Button>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-hidden flex gap-3 px-6 lg:px-8 pb-6 min-h-0">
          <div className="flex-1 min-w-0 overflow-auto rounded-lg border bg-card">
            {view === "month" && (
              <MonthGrid
                cursor={cursor}
                statuses={statuses}
                tasksByDay={tasksByDay}
                onOpenTask={setOpenTaskId}
                onCreate={createTaskOnDay}
              />
            )}
            {view === "week" && (
              <TimeGrid
                days={eachDayOfInterval({
                  start: startOfWeek(cursor, { weekStartsOn: 0 }),
                  end: endOfWeek(cursor, { weekStartsOn: 0 }),
                })}
                statuses={statuses}
                tasksByDay={tasksByDay}
                onOpenTask={setOpenTaskId}
                onCreate={createTaskOnDay}
              />
            )}
            {view === "day" && (
              <TimeGrid
                days={[cursor]}
                statuses={statuses}
                tasksByDay={tasksByDay}
                onOpenTask={setOpenTaskId}
                onCreate={createTaskOnDay}
              />
            )}
          </div>

          {showUndated ? (
            <UndatedPanel
              tasks={undatedTasks}
              statuses={statuses}
              onOpen={setOpenTaskId}
              onCollapse={() => setShowUndated(false)}
            />
          ) : (
            <Button
              variant="outline" size="sm"
              className="h-8 self-start"
              onClick={() => setShowUndated(true)}
            >
              Sem data ({undatedTasks.length})
            </Button>
          )}
        </div>

        <DragOverlay>
          {activeTask && <TaskPill task={activeTask} statuses={statuses} dragging />}
        </DragOverlay>
      </DndContext>

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

// ============== Month Grid ==============
function MonthGrid({
  cursor, statuses, tasksByDay, onOpenTask, onCreate,
}: {
  cursor: Date;
  statuses: Status[];
  tasksByDay: Map<string, Task[]>;
  onOpenTask: (id: string) => void;
  onCreate: (day: Date, title: string) => Promise<void>;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });
  const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {weekDays.map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            inMonth={isSameMonth(day, cursor)}
            tasks={tasksByDay.get(format(day, "yyyy-MM-dd")) ?? []}
            statuses={statuses}
            onOpenTask={onOpenTask}
            onCreate={onCreate}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day, inMonth, tasks, statuses, onOpenTask, onCreate,
}: {
  day: Date;
  inMonth: boolean;
  tasks: Task[];
  statuses: Status[];
  onOpenTask: (id: string) => void;
  onCreate: (day: Date, title: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${format(day, "yyyy-MM-dd")}`,
    data: { day: day.toISOString() },
  });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [title, setTitle] = useState("");

  const visible = tasks.slice(0, 3);
  const extra = tasks.length - visible.length;
  const today = isToday(day);
  const weekend = isWeekend(day);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative border-b border-r last:border-r-0 p-1.5 flex flex-col gap-1 min-h-[110px] transition-colors",
        weekend && "bg-muted/20",
        !inMonth && "opacity-50 bg-muted/10",
        isOver && "bg-primary/10 ring-1 ring-primary/40 ring-inset",
      )}
    >
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "self-start text-xs font-medium h-6 min-w-6 px-1.5 rounded-full flex items-center justify-center hover:bg-accent",
              today && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {format(day, "d")}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              await onCreate(day, title);
              setTitle("");
              setPopoverOpen(false);
            }}
            className="flex flex-col gap-2"
          >
            <p className="text-xs font-medium">
              Nova tarefa em {format(day, "d 'de' MMM", { locale: ptBR })}
            </p>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da tarefa"
              className="h-8"
            />
            <Button type="submit" size="sm" className="h-8" disabled={!title.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Criar
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      <div className="flex flex-col gap-1 overflow-hidden">
        {visible.map((t) => (
          <TaskPill key={t.id} task={t} statuses={statuses} onClick={() => onOpenTask(t.id)} />
        ))}
        {extra > 0 && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button className="text-[11px] text-muted-foreground hover:text-foreground text-left px-1.5 py-0.5 rounded hover:bg-accent">
                +{extra} mais
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2 max-h-72 overflow-auto">
              <p className="text-xs font-medium mb-2">{format(day, "d 'de' MMM", { locale: ptBR })}</p>
              <div className="flex flex-col gap-1">
                {tasks.map((t) => (
                  <TaskPill key={t.id} task={t} statuses={statuses}
                    onClick={() => { setMoreOpen(false); onOpenTask(t.id); }} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

// ============== Time Grid (week/day) ==============
function TimeGrid({
  days, statuses, tasksByDay, onOpenTask, onCreate,
}: {
  days: Date[];
  statuses: Status[];
  tasksByDay: Map<string, Task[]>;
  onOpenTask: (id: string) => void;
  onCreate: (day: Date, title: string) => Promise<void>;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="grid border-b bg-muted/30 sticky top-0 z-10"
        style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className={cn(
            "px-2 py-2 text-center border-l",
            isToday(d) && "bg-primary/10",
          )}>
            <div className="text-[10px] uppercase text-muted-foreground">
              {format(d, "EEE", { locale: ptBR })}
            </div>
            <div className={cn("text-sm font-medium", isToday(d) && "text-primary")}>
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-auto">
        <div className="grid relative"
          style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
          {hours.map((h) => (
            <div key={`hr-${h}`} className="contents">
              <div className="text-[10px] text-muted-foreground text-right pr-2 pt-0.5 border-b h-12">
                {String(h).padStart(2, "0")}:00
              </div>
              {days.map((d) => (
                <HourCell
                  key={`${d.toISOString()}-${h}`}
                  day={d}
                  hour={h}
                  tasks={(tasksByDay.get(format(d, "yyyy-MM-dd")) ?? []).filter(
                    (t) => t.due_date && new Date(t.due_date).getHours() === h,
                  )}
                  statuses={statuses}
                  onOpenTask={onOpenTask}
                  onCreate={onCreate}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HourCell({
  day, hour, tasks, statuses, onOpenTask, onCreate,
}: {
  day: Date; hour: number; tasks: Task[];
  statuses: Status[];
  onOpenTask: (id: string) => void;
  onCreate: (day: Date, title: string) => Promise<void>;
}) {
  const slot = new Date(day); slot.setHours(hour, 0, 0, 0);
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slot.toISOString()}`,
    data: { day: slot.toISOString() },
  });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-l border-b h-12 p-0.5 flex flex-col gap-0.5 overflow-hidden transition-colors relative",
        isWeekend(day) && "bg-muted/10",
        isToday(day) && "bg-primary/[0.03]",
        isOver && "bg-primary/10",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="absolute inset-0 hover:bg-accent/30" aria-label="Criar tarefa neste horário" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              await onCreate(slot, title);
              setTitle("");
              setOpen(false);
            }}
            className="flex flex-col gap-2"
          >
            <p className="text-xs font-medium">
              Nova tarefa às {String(hour).padStart(2, "0")}:00
            </p>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Título" className="h-8" />
            <Button type="submit" size="sm" className="h-8" disabled={!title.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Criar
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <div className="relative z-10 flex flex-col gap-0.5">
        {tasks.map((t) => (
          <TaskPill key={t.id} task={t} statuses={statuses} onClick={() => onOpenTask(t.id)} />
        ))}
      </div>
    </div>
  );
}

// ============== Pill ==============
function TaskPill({
  task, statuses, onClick, dragging,
}: {
  task: Task; statuses: Status[];
  onClick?: () => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const status = statuses.find((s) => s.id === task.status_id);
  const color = status?.color ?? "#94a3b8";

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        "w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] truncate border transition-opacity cursor-grab active:cursor-grabbing",
        (isDragging || dragging) && "opacity-40",
      )}
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}50`,
        color: undefined,
      }}
      title={task.title}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: priorityColor[task.priority] }}
      />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

// ============== Undated Panel ==============
function UndatedPanel({
  tasks, statuses, onOpen, onCollapse,
}: {
  tasks: Task[]; statuses: Status[];
  onOpen: (id: string) => void;
  onCollapse: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "undated", data: { undated: true },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-64 shrink-0 rounded-lg border bg-card flex flex-col transition-colors",
        isOver && "ring-1 ring-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Sem data</span>
          <Badge variant="secondary" className="h-5 font-normal">{tasks.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCollapse} aria-label="Recolher">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Arraste tarefas aqui para remover a data.
          </p>
        ) : tasks.map((t) => (
          <TaskPill key={t.id} task={t} statuses={statuses} onClick={() => onOpen(t.id)} />
        ))}
      </div>
    </div>
  );
}
