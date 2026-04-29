import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, endOfWeek,
  format, isSameDay, parseISO, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, ChevronLeft, ChevronRight, GanttChart, LayoutList, Trello,
  Table as TableIcon, Calendar as CalendarIcon, Loader2, ChevronDown,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { useStatuses } from "@/hooks/useStatuses";
import { useListMembers } from "@/hooks/useListMembers";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  GanttTask, useCreateGanttTask, useGanttTasks, useTaskRelations, useUpdateTaskDates,
} from "@/hooks/useGanttTasks";

type Zoom = "day" | "week" | "month";
type GroupBy = "status" | "priority" | "assignee" | "none";

const ROW_H = 40;
const SUB_ROW_H = 32;
const HEADER_H = 56;
const LEFT_PANEL_DEFAULT = 280;
const LEFT_PANEL_MIN = 180;
const LEFT_PANEL_MAX = 480;

const PRIORITY_LABEL = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" } as const;
const PRIORITY_CLASS = {
  low: "bg-priority-low/15 text-priority-low border-priority-low/30",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
  urgent: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30",
} as const;

function colWidth(zoom: Zoom): number {
  return zoom === "day" ? 48 : zoom === "week" ? 96 : 140;
}
function unitDays(zoom: Zoom): number {
  return zoom === "day" ? 1 : zoom === "week" ? 7 : 30;
}
function rangeStart(d: Date, zoom: Zoom) {
  return zoom === "day" ? startOfDay(d) : zoom === "week" ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d);
}
function rangeEnd(d: Date, zoom: Zoom) {
  return zoom === "day" ? startOfDay(d) : zoom === "week" ? endOfWeek(d, { weekStartsOn: 1 }) : endOfMonth(d);
}
function pxPerDay(zoom: Zoom) {
  return colWidth(zoom) / unitDays(zoom);
}
function dateToX(d: Date, anchor: Date, zoom: Zoom) {
  return differenceInCalendarDays(d, anchor) * pxPerDay(zoom);
}
function xToDate(x: number, anchor: Date, zoom: Zoom) {
  return addDays(anchor, Math.round(x / pxPerDay(zoom)));
}

export default function GanttView() {
  const { listId } = useParams<{ listId: string }>();
  const { current } = useWorkspace();
  const workspaceId = current?.id;

  const { data: tasks = [], isLoading } = useGanttTasks(listId);
  const { data: statuses = [] } = useStatuses(listId);
  const { data: members = [] } = useListMembers(workspaceId);
  const updateDates = useUpdateTaskDates(listId);
  const createTask = useCreateGanttTask(listId, workspaceId);
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const { data: relations = [] } = useTaskRelations(workspaceId, taskIds);

  const { data: listData } = useQuery({
    queryKey: ["list-name", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data } = await supabase.from("lists").select("name").eq("id", listId!).maybeSingle();
      return data?.name ?? "";
    },
  });

  // Toolbar state
  const [zoom, setZoom] = useState<Zoom>("day");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [showRelations, setShowRelations] = useState(true);
  const [showSubtasks, setShowSubtasks] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(LEFT_PANEL_DEFAULT);

  // Time anchor (visible window start) — adjustable via nav buttons
  const [anchor, setAnchor] = useState<Date>(() => addDays(startOfDay(new Date()), -30));

  // Container refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  // Visible range = a generous window of columns around anchor (e.g. 365 days)
  const totalUnits = zoom === "day" ? 365 : zoom === "week" ? 52 : 24;
  const totalDays = totalUnits * unitDays(zoom);
  const totalWidth = totalUnits * colWidth(zoom);

  // Group tasks
  const grouped = useMemo(() => {
    const visible = showSubtasks ? tasks : tasks.filter((t) => !t.parent_task_id);
    if (groupBy === "none") return [{ key: "all", label: "Todas as tarefas", color: "#64748b", tasks: visible }];

    const map = new Map<string, { key: string; label: string; color: string; tasks: GanttTask[] }>();
    for (const t of visible) {
      let key = "—", label = "—", color = "#94a3b8";
      if (groupBy === "status") {
        const s = statuses.find((x) => x.id === t.status_id);
        key = t.status_id ?? "none"; label = s?.name ?? "Sem status"; color = s?.color ?? "#94a3b8";
      } else if (groupBy === "priority") {
        key = t.priority; label = PRIORITY_LABEL[t.priority];
        color = t.priority === "urgent" ? "#ef4444" : t.priority === "high" ? "#f97316"
              : t.priority === "medium" ? "#eab308" : "#94a3b8";
      } else if (groupBy === "assignee") {
        const m = members.find((x) => x.id === t.assignee_id);
        key = t.assignee_id ?? "none"; label = m?.display_name ?? m?.email ?? "Sem responsável";
      }
      if (!map.has(key)) map.set(key, { key, label, color, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [tasks, groupBy, statuses, members, showSubtasks]);

  // Flatten into rows: [groupHeader, ...tasks(parents+subtasks intercalated)]
  type Row =
    | { kind: "group"; key: string; label: string; color: string; collapsed: boolean; count: number }
    | { kind: "task"; task: GanttTask; isSub: boolean; height: number };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of grouped) {
      const collapsed = collapsedGroups.has(g.key);
      out.push({ kind: "group", key: g.key, label: g.label, color: g.color, collapsed, count: g.tasks.length });
      if (collapsed) continue;
      // Parents first then their subtasks underneath
      const parents = g.tasks.filter((t) => !t.parent_task_id);
      const childrenByParent = new Map<string, GanttTask[]>();
      for (const t of g.tasks) {
        if (t.parent_task_id) {
          const arr = childrenByParent.get(t.parent_task_id) ?? [];
          arr.push(t); childrenByParent.set(t.parent_task_id, arr);
        }
      }
      for (const p of parents) {
        out.push({ kind: "task", task: p, isSub: false, height: ROW_H });
        if (showSubtasks) {
          for (const c of childrenByParent.get(p.id) ?? []) {
            out.push({ kind: "task", task: c, isSub: true, height: SUB_ROW_H });
          }
        }
      }
      // Orphans (subtasks whose parent is in another group)
      for (const t of g.tasks) {
        if (t.parent_task_id && !parents.some((p) => p.id === t.parent_task_id)) {
          out.push({ kind: "task", task: t, isSub: true, height: SUB_ROW_H });
        }
      }
    }
    return out;
  }, [grouped, collapsedGroups, showSubtasks]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const r = rows[i];
      if (r.kind === "group") return 36;
      return r.height;
    },
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // Build map of taskId -> rowIndex for relation drawing
  const taskRowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => { if (r.kind === "task") m.set(r.task.id, i); });
    return m;
  }, [rows]);

  // Header columns
  const headerCols = useMemo(() => {
    const arr: { x: number; primary: string; secondary?: string; isToday?: boolean; date: Date }[] = [];
    for (let i = 0; i < totalUnits; i++) {
      const d = zoom === "day" ? addDays(anchor, i) : zoom === "week" ? addWeeks(anchor, i) : addMonths(anchor, i);
      const x = i * colWidth(zoom);
      let primary = "", secondary: string | undefined;
      if (zoom === "day") {
        primary = format(d, "EEE", { locale: ptBR });
        secondary = format(d, "d/MM");
      } else if (zoom === "week") {
        primary = `Sem ${format(d, "ww")}`;
        secondary = format(d, "MMM yy", { locale: ptBR });
      } else {
        primary = format(d, "MMMM", { locale: ptBR });
        secondary = format(d, "yyyy");
      }
      arr.push({ x, primary, secondary, isToday: zoom === "day" && isSameDay(d, new Date()), date: d });
    }
    return arr;
  }, [anchor, zoom, totalUnits]);

  const todayX = useMemo(() => dateToX(new Date(), anchor, zoom), [anchor, zoom]);

  // Sync horizontal scroll with header
  const onGridScroll = useCallback(() => {
    if (scrollRef.current && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
    if (scrollRef.current && leftScrollRef.current) {
      leftScrollRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  }, []);

  // "Today" button
  const goToday = () => {
    const newAnchor = addDays(startOfDay(new Date()), zoom === "day" ? -10 : zoom === "week" ? -28 : -90);
    setAnchor(rangeStart(newAnchor, zoom));
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        const x = dateToX(new Date(), rangeStart(newAnchor, zoom), zoom);
        scrollRef.current.scrollLeft = Math.max(0, x - 200);
      }
    });
  };

  const navPrev = () => {
    const delta = zoom === "day" ? -30 : zoom === "week" ? -90 : -365;
    setAnchor(addDays(anchor, delta));
  };
  const navNext = () => {
    const delta = zoom === "day" ? 30 : zoom === "week" ? 90 : 365;
    setAnchor(addDays(anchor, delta));
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  // Resize panel
  const resizingRef = useRef(false);
  const onResizerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = leftWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, startW + (ev.clientX - startX)));
      setLeftWidth(w);
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Center on today on mount / zoom change
  useEffect(() => {
    if (!scrollRef.current) return;
    const x = dateToX(new Date(), anchor, zoom);
    if (x >= 0 && x <= totalWidth) {
      scrollRef.current.scrollLeft = Math.max(0, x - 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Drag/resize bars
  type DragState = {
    taskId: string; mode: "move" | "resize-start" | "resize-end";
    initialStart: Date | null; initialEnd: Date | null;
    startX: number;
    previewStart: Date | null; previewEnd: Date | null;
  };
  const [dragState, setDragState] = useState<DragState | null>(null);

  const onBarPointerDown = (e: React.PointerEvent, t: GanttTask, mode: DragState["mode"]) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      taskId: t.id,
      mode,
      initialStart: t.start_date ? parseISO(t.start_date) : null,
      initialEnd: t.due_date ? parseISO(t.due_date) : null,
      startX: e.clientX,
      previewStart: t.start_date ? parseISO(t.start_date) : null,
      previewEnd: t.due_date ? parseISO(t.due_date) : null,
    });
  };

  const onBarPointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const dxPx = e.clientX - dragState.startX;
    const dxDays = Math.round(dxPx / pxPerDay(zoom));
    let s = dragState.initialStart;
    let en = dragState.initialEnd;
    if (dragState.mode === "move") {
      if (s) s = addDays(s, dxDays);
      if (en) en = addDays(en, dxDays);
    } else if (dragState.mode === "resize-start") {
      if (s) s = addDays(s, dxDays);
      if (s && en && s > en) s = en;
    } else if (dragState.mode === "resize-end") {
      if (en) en = addDays(en, dxDays);
      if (s && en && en < s) en = s;
    }
    setDragState({ ...dragState, previewStart: s, previewEnd: en });
  };

  const onBarPointerUp = (e: React.PointerEvent) => {
    if (!dragState) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const { taskId, previewStart, previewEnd, initialStart, initialEnd } = dragState;
    const startChanged = (previewStart?.getTime() ?? null) !== (initialStart?.getTime() ?? null);
    const endChanged = (previewEnd?.getTime() ?? null) !== (initialEnd?.getTime() ?? null);
    if (startChanged || endChanged) {
      updateDates.mutate({
        id: taskId,
        ...(startChanged ? { start_date: previewStart ? previewStart.toISOString() : null } : {}),
        ...(endChanged ? { due_date: previewEnd ? previewEnd.toISOString() : null } : {}),
      });
    }
    setDragState(null);
  };

  // Create-by-drag on empty grid row
  type CreateDrag = { rowTop: number; startX: number; endX: number; status_id: string | null; popoverX: number };
  const [createDrag, setCreateDrag] = useState<CreateDrag | null>(null);
  const [pendingCreate, setPendingCreate] = useState<{
    start: Date; end: Date; status_id: string | null; popoverX: number; rowTop: number;
  } | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");

  // Compute date for a task bar
  const barDates = (t: GanttTask) => {
    const drag = dragState && dragState.taskId === t.id ? dragState : null;
    const start = drag?.previewStart ?? (t.start_date ? parseISO(t.start_date) : null);
    const end = drag?.previewEnd ?? (t.due_date ? parseISO(t.due_date) : null);
    return { start, end };
  };

  // Relations: SVG arrows
  const relationLines = useMemo(() => {
    if (!showRelations) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number; conflict: boolean; key: string }[] = [];
    for (const r of relations) {
      const sIdx = taskRowIndex.get(r.source_task_id);
      const tIdx = taskRowIndex.get(r.target_task_id);
      if (sIdx == null || tIdx == null) continue;
      const sRow = rows[sIdx];
      const tRow = rows[tIdx];
      if (sRow.kind !== "task" || tRow.kind !== "task") continue;
      const sd = barDates(sRow.task), td = barDates(tRow.task);
      if (!sd.end || !td.start) continue;
      const x1 = dateToX(sd.end, anchor, zoom);
      const x2 = dateToX(td.start, anchor, zoom);
      // y positions from virtualizer
      const sVirtual = virtualItems.find((v) => v.index === sIdx);
      const tVirtual = virtualItems.find((v) => v.index === tIdx);
      if (!sVirtual || !tVirtual) continue;
      const y1 = sVirtual.start + sVirtual.size / 2;
      const y2 = tVirtual.start + tVirtual.size / 2;
      const conflict = td.start < sd.end;
      lines.push({ x1, y1, x2, y2, conflict, key: r.id });
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relations, showRelations, taskRowIndex, rows, virtualItems, anchor, zoom, dragState]);

  if (!listId) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">{listData ?? "Lista"}</h1>
        </div>

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
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link to={`/list/${listId}/calendar`}><CalendarDays className="h-4 w-4 mr-1.5" />Calendário</Link>
          </Button>
          <Button variant="secondary" size="sm" className="h-8">
            <GanttChart className="h-4 w-4 mr-1.5" />Gantt
          </Button>
        </div>

        <div className="flex-1" />

        <div className="flex gap-1 rounded-md border p-0.5">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <Button
              key={z}
              variant={zoom === z ? "secondary" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setZoom(z)}
            >
              {z === "day" ? "Dias" : z === "week" ? "Semanas" : "Meses"}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={navPrev} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={goToday}>Hoje</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={navNext} aria-label="Próximo">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="status">Por status</SelectItem>
            <SelectItem value="priority">Por prioridade</SelectItem>
            <SelectItem value="assignee">Por responsável</SelectItem>
            <SelectItem value="none">Sem agrupar</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch id="show-rel" checked={showRelations} onCheckedChange={setShowRelations} />
          <Label htmlFor="show-rel" className="text-xs cursor-pointer">Dependências</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-sub" checked={showSubtasks} onCheckedChange={setShowSubtasks} />
          <Label htmlFor="show-sub" className="text-xs cursor-pointer">Subtarefas</Label>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 grid place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 relative">
          {/* LEFT PANEL */}
          <div
            className="border-r bg-card flex flex-col"
            style={{ width: leftWidth, flexShrink: 0 }}
          >
            <div
              className="border-b bg-muted/30 flex items-end px-3 text-xs font-medium text-muted-foreground"
              style={{ height: HEADER_H }}
            >
              Tarefa
            </div>
            <div
              ref={leftScrollRef}
              className="flex-1 overflow-hidden"
              style={{ overflowY: "hidden" }}
            >
              <div style={{ height: totalHeight, position: "relative" }}>
                {virtualItems.map((vi) => {
                  const r = rows[vi.index];
                  return (
                    <div
                      key={vi.key}
                      style={{
                        position: "absolute", top: vi.start, left: 0, right: 0, height: vi.size,
                      }}
                    >
                      {r.kind === "group" ? (
                        <button
                          onClick={() => toggleGroup(r.key)}
                          className="flex items-center gap-2 w-full h-full px-3 bg-muted/50 hover:bg-muted text-sm font-medium text-left border-b"
                        >
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", r.collapsed && "-rotate-90")} />
                          <div className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                          <span className="flex-1 truncate">{r.label}</span>
                          <Badge variant="outline" className="text-xs">{r.count}</Badge>
                        </button>
                      ) : (
                        <TaskRowLeft
                          task={r.task}
                          isSub={r.isSub}
                          statuses={statuses}
                          onOpen={() => setOpenTaskId(r.task.id)}
                          onSetDates={(s, d) => updateDates.mutate({
                            id: r.task.id,
                            start_date: s ? s.toISOString() : null,
                            due_date: d ? d.toISOString() : null,
                          })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RESIZER */}
          <div
            onMouseDown={onResizerDown}
            className="w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors shrink-0"
          />

          {/* RIGHT GRID */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Header */}
            <div
              ref={headerScrollRef}
              className="border-b bg-muted/30 overflow-hidden shrink-0"
              style={{ height: HEADER_H }}
            >
              <div style={{ width: totalWidth, height: "100%", position: "relative" }}>
                {headerCols.map((c, i) => (
                  <div
                    key={i}
                    className={cn(
                      "absolute top-0 bottom-0 border-r flex flex-col justify-end pb-1 px-2",
                      c.isToday && "bg-primary/10",
                    )}
                    style={{ left: c.x, width: colWidth(zoom) }}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.secondary}</div>
                    <div className={cn("text-xs font-medium", c.isToday && "text-primary")}>{c.primary}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div
              ref={scrollRef}
              onScroll={onGridScroll}
              className="flex-1 overflow-auto relative"
              onPointerMove={dragState ? onBarPointerMove : undefined}
              onPointerUp={dragState ? onBarPointerUp : undefined}
            >
              <div style={{ width: totalWidth, height: totalHeight, position: "relative" }}>
                {/* Vertical column lines */}
                {headerCols.map((c, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-r border-border/40 pointer-events-none"
                    style={{ left: c.x, width: colWidth(zoom) }}
                  />
                ))}

                {/* Today marker */}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
                    style={{ left: todayX }}
                  />
                )}

                {/* Rows + bars */}
                {virtualItems.map((vi) => {
                  const r = rows[vi.index];
                  if (r.kind === "group") {
                    return (
                      <div
                        key={vi.key}
                        className="absolute left-0 right-0 bg-muted/30 border-b"
                        style={{ top: vi.start, height: vi.size }}
                      />
                    );
                  }
                  const t = r.task;
                  const { start, end } = barDates(t);
                  const status = statuses.find((s) => s.id === t.status_id);
                  const color = status?.color ?? "#64748b";

                  return (
                    <GridRow
                      key={vi.key}
                      top={vi.start}
                      height={vi.size}
                      onCreateDragStart={(x) => {
                        setCreateDrag({
                          rowTop: vi.start, startX: x, endX: x,
                          status_id: t.status_id ?? statuses[0]?.id ?? null,
                          popoverX: x,
                        });
                      }}
                      onCreateDragMove={(x) => {
                        setCreateDrag((cd) => cd ? { ...cd, endX: x } : cd);
                      }}
                      onCreateDragEnd={() => {
                        if (!createDrag) return;
                        const x1 = Math.min(createDrag.startX, createDrag.endX);
                        const x2 = Math.max(createDrag.startX, createDrag.endX);
                        if (x2 - x1 < 8) { setCreateDrag(null); return; }
                        const s = xToDate(x1, anchor, zoom);
                        const e = xToDate(x2, anchor, zoom);
                        setPendingCreate({
                          start: s, end: e, status_id: createDrag.status_id,
                          popoverX: (x1 + x2) / 2, rowTop: createDrag.rowTop,
                        });
                        setCreateDrag(null);
                      }}
                    >
                      {start && end ? (
                        <Bar
                          startX={dateToX(start, anchor, zoom)}
                          endX={dateToX(end, anchor, zoom) + pxPerDay(zoom)}
                          color={color}
                          title={t.title}
                          isSub={r.isSub}
                          onPointerDown={(e, mode) => onBarPointerDown(e, t, mode)}
                          onClick={() => setOpenTaskId(t.id)}
                          isDragging={dragState?.taskId === t.id}
                        />
                      ) : end ? (
                        <Diamond
                          x={dateToX(end, anchor, zoom) + pxPerDay(zoom) / 2}
                          color={color}
                          onClick={() => setOpenTaskId(t.id)}
                          title={t.title}
                        />
                      ) : null}
                    </GridRow>
                  );
                })}

                {/* Create drag preview */}
                {createDrag && (
                  <div
                    className="absolute bg-primary/30 border border-primary rounded pointer-events-none z-10"
                    style={{
                      top: createDrag.rowTop + 8,
                      height: ROW_H - 16,
                      left: Math.min(createDrag.startX, createDrag.endX),
                      width: Math.abs(createDrag.endX - createDrag.startX),
                    }}
                  />
                )}

                {/* Pending create popover */}
                {pendingCreate && (
                  <Popover open onOpenChange={(o) => { if (!o) { setPendingCreate(null); setPendingTitle(""); } }}>
                    <PopoverTrigger asChild>
                      <div
                        className="absolute"
                        style={{ left: pendingCreate.popoverX, top: pendingCreate.rowTop, width: 1, height: 1 }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="center">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {format(pendingCreate.start, "d MMM", { locale: ptBR })} → {format(pendingCreate.end, "d MMM", { locale: ptBR })}
                        </div>
                        <Input
                          autoFocus
                          value={pendingTitle}
                          onChange={(e) => setPendingTitle(e.target.value)}
                          placeholder="Título da tarefa"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && pendingTitle.trim()) {
                              createTask.mutate({
                                title: pendingTitle.trim(),
                                start_date: pendingCreate.start.toISOString(),
                                due_date: pendingCreate.end.toISOString(),
                                status_id: pendingCreate.status_id,
                              });
                              setPendingCreate(null);
                              setPendingTitle("");
                            } else if (e.key === "Escape") {
                              setPendingCreate(null);
                              setPendingTitle("");
                            }
                          }}
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setPendingCreate(null); setPendingTitle(""); }}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={!pendingTitle.trim()}
                            onClick={() => {
                              createTask.mutate({
                                title: pendingTitle.trim(),
                                start_date: pendingCreate.start.toISOString(),
                                due_date: pendingCreate.end.toISOString(),
                                status_id: pendingCreate.status_id,
                              });
                              setPendingCreate(null);
                              setPendingTitle("");
                            }}
                          >
                            Criar
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Relation arrows */}
                {showRelations && relationLines.length > 0 && (
                  <svg
                    className="absolute top-0 left-0 pointer-events-none z-10"
                    width={totalWidth}
                    height={totalHeight}
                  >
                    <defs>
                      <marker id="arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
                      </marker>
                      <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--destructive))" />
                      </marker>
                    </defs>
                    {relationLines.map((l) => {
                      const midX = l.x1 + Math.max(20, (l.x2 - l.x1) / 2);
                      const path = `M ${l.x1} ${l.y1} L ${midX} ${l.y1} L ${midX} ${l.y2} L ${l.x2} ${l.y2}`;
                      const stroke = l.conflict ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))";
                      return (
                        <path
                          key={l.key}
                          d={path}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={1.5}
                          strokeDasharray={l.conflict ? "4 2" : undefined}
                          markerEnd={l.conflict ? "url(#arrow-red)" : "url(#arrow-gray)"}
                          opacity={0.7}
                        />
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {openTaskId && (
        <TaskDetailDialog
          taskId={openTaskId}
          listId={listId ?? ""}
          doneStatusId={statuses.find((s) => s.is_done)?.id ?? null}
          open={!!openTaskId}
          onOpenChange={(o) => !o && setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

/* ---- Subcomponents ---- */

function TaskRowLeft({
  task, isSub, statuses, onOpen, onSetDates,
}: {
  task: GanttTask; isSub: boolean;
  statuses: { id: string; name: string; color: string | null }[];
  onOpen: () => void;
  onSetDates: (start: Date | null, end: Date | null) => void;
}) {
  const status = statuses.find((s) => s.id === task.status_id);
  const [open, setOpen] = useState(false);
  const initialStart = task.start_date ? parseISO(task.start_date) : undefined;
  const initialEnd = task.due_date ? parseISO(task.due_date) : undefined;
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({ from: initialStart, to: initialEnd });

  useEffect(() => {
    setRange({ from: initialStart, to: initialEnd });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.start_date, task.due_date]);

  return (
    <div
      className={cn(
        "group flex items-center gap-2 h-full px-3 border-b hover:bg-muted/40 cursor-pointer",
        isSub && "pl-8 text-sm",
      )}
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{task.title}</div>
        <div className="flex gap-1.5 items-center mt-0.5">
          {status && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm border"
              style={{ borderColor: `${status.color}66`, color: status.color ?? undefined }}
            >
              {status.name}
            </span>
          )}
          <Badge variant="outline" className={cn("text-[10px]", PRIORITY_CLASS[task.priority])}>
            {PRIORITY_LABEL[task.priority]}
          </Badge>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            aria-label="Definir datas"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
          <Calendar
            mode="range"
            selected={range as any}
            onSelect={(v: any) => setRange(v ?? {})}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="flex justify-end gap-2 p-2 border-t">
            <Button size="sm" variant="ghost" onClick={() => { onSetDates(null, null); setOpen(false); }}>
              Limpar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSetDates(range.from ?? null, range.to ?? range.from ?? null);
                setOpen(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function GridRow({
  top, height, children, onCreateDragStart, onCreateDragMove, onCreateDragEnd,
}: {
  top: number; height: number;
  children: React.ReactNode;
  onCreateDragStart: (x: number) => void;
  onCreateDragMove: (x: number) => void;
  onCreateDragEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // click on bar
    if (!ref.current) return;
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = ref.current.getBoundingClientRect();
    onCreateDragStart(e.clientX - rect.left);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onCreateDragMove(e.clientX - rect.left);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    onCreateDragEnd();
  };

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 border-b border-border/30"
      style={{ top, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </div>
  );
}

function Bar({
  startX, endX, color, title, isSub, onPointerDown, onClick, isDragging,
}: {
  startX: number; endX: number; color: string; title: string; isSub: boolean;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "resize-start" | "resize-end") => void;
  onClick: () => void; isDragging: boolean;
}) {
  const w = Math.max(12, endX - startX);
  const showLabel = w > 60;
  return (
    <div
      className={cn(
        "absolute rounded shadow-sm flex items-center px-2 cursor-grab active:cursor-grabbing select-none",
        isSub ? "top-1.5 h-5 text-[11px]" : "top-2 h-6 text-xs",
        isDragging && "ring-2 ring-primary ring-offset-1",
      )}
      style={{
        left: startX,
        width: w,
        background: color,
        color: "#fff",
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-black/20"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, "resize-start"); }}
      />
      {showLabel && <span className="truncate flex-1 mx-1">{title}</span>}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-black/20"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, "resize-end"); }}
      />
    </div>
  );
}

function Diamond({ x, color, onClick, title }: { x: number; color: string; onClick: () => void; title: string }) {
  return (
    <div
      className="absolute top-2 cursor-pointer"
      style={{ left: x - 8 }}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <div
        className="h-4 w-4 rotate-45 border-2 border-white shadow"
        style={{ background: color }}
      />
    </div>
  );
}
