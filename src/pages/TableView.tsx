import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ChevronDown, ChevronRight, LayoutList, Loader2, Plus, Table as TableIcon, Trello,
  ArrowUp, ArrowDown, ArrowUpDown, Trash2, Check, CalendarDays,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { AssigneeSelect, type AssigneeMember } from "@/components/AssigneeSelect";
import { TagsInput } from "@/components/TagsInput";
import { useStatuses } from "@/hooks/useStatuses";
import {
  useCreateTask, useDeleteTask, useTasks, useUpdateTask, useUpdateTaskAssigneesInList,
  type TaskWithFieldValues,
} from "@/hooks/useTasks";
import {
  useCreateCustomField, useCustomFields, useSetTaskFieldValue,
  type CustomField, type CustomFieldType,
} from "@/hooks/useCustomFields";
import { useListMembers } from "@/hooks/useListMembers";
import { useTaskTimeTotals } from "@/hooks/useTimeTracking";
import { TaskTimeCell } from "@/components/TaskTimeCell";
import type { Priority, Status } from "@/types/task";
import { cn } from "@/lib/utils";

type Task = TaskWithFieldValues;

const priorityLabel: Record<Priority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};
const priorityClass: Record<Priority, string> = {
  low: "bg-priority-low/15 text-priority-low border-priority-low/30",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
  urgent: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30",
};

type SortKey = "title" | "status" | "priority" | "due_date" | string;
type SortDir = "asc" | "desc";

const DEFAULT_WIDTHS: Record<string, number> = {
  done: 44,
  title: 320,
  status: 160,
  priority: 140,
  assignees: 180,
  due_date: 150,
  time: 140,
  tags: 220,
};

export default function TableView() {
  const { listId } = useParams<{ listId: string }>();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [groupByStatus, setGroupByStatus] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");

  const { data: listData } = useQuery({
    queryKey: ["list-name", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data } = await supabase.from("lists").select("name").eq("id", listId!).maybeSingle();
      return data?.name ?? "";
    },
  });
  const listName = listData ?? "";

  const { data: statuses = [], isLoading: statusesLoading } = useStatuses(listId);
  const { data: tasks = [], isLoading: tasksLoading } = useTasks(listId, { withFieldValues: true });
  const { data: fields = [] } = useCustomFields(listId);
  const { data: members = [] } = useListMembers(current?.id);

  const updateTaskMut = useUpdateTask(listId ?? "");
  const deleteTaskMut = useDeleteTask(listId ?? "");
  const createTaskMut = useCreateTask(listId ?? "");
  const updateAssignees = useUpdateTaskAssigneesInList(listId ?? "");
  const setFieldValueMut = useSetTaskFieldValue(listId ?? "");
  const createFieldMut = useCreateCustomField(listId ?? "");

  const loading = statusesLoading || tasksLoading;

  const doneStatusId = useMemo(() => statuses.find((s) => s.is_done)?.id ?? null, [statuses]);
  const defaultStatusId = useMemo(() => statuses[0]?.id ?? null, [statuses]);

  const isDone = (t: Task) => !!t.status_id && t.status_id === doneStatusId;

  const updateTask = (id: string, patch: Parameters<typeof updateTaskMut.mutate>[0]["patch"]) => {
    updateTaskMut.mutate({ id, patch });
  };

  const toggleDone = async (t: Task) => {
    if (!doneStatusId) {
      const { toast } = await import("sonner");
      toast.error("Configure um status 'concluído' na lista");
      return;
    }
    const next = isDone(t) ? defaultStatusId : doneStatusId;
    updateTask(t.id, { status_id: next });
  };

  const addAssignee = (taskId: string, userId: string) => {
    if (!current) return;
    const u = members.find((m) => m.id === userId);
    if (!u) return;
    updateAssignees.mutate({ taskId, workspaceId: current.id, add: { user: u } });
  };

  const removeAssignee = (taskId: string, userId: string) => {
    if (!current) return;
    updateAssignees.mutate({ taskId, workspaceId: current.id, remove: { userId } });
  };

  const setFieldValue = (taskId: string, fieldId: string, value: unknown) => {
    if (!current) return;
    setFieldValueMut.mutate({ taskId, fieldId, workspaceId: current.id, value });
  };

  const deleteTask = (id: string) => {
    deleteTaskMut.mutate(id);
  };

  const createTask = async (title: string, statusId: string | null) => {
    if (!current || !listId || !user || !title.trim()) return;
    await createTaskMut.mutateAsync({
      workspace_id: current.id,
      title: title.trim(),
      status_id: statusId ?? defaultStatusId,
      created_by: user.id,
      position: tasks.length,
    });
  };

  const createField = async () => {
    if (!current || !listId || !newFieldName.trim()) return;
    await createFieldMut.mutateAsync({
      workspace_id: current.id,
      name: newFieldName.trim(),
      type: newFieldType,
      position: fields.length,
      created_by: user?.id ?? null,
    });
    setNewFieldName("");
    setNewFieldType("text");
    setNewFieldOpen(false);
  };

  // ===== Sorting =====
  const sortedTasks = useMemo(() => {
    if (!sort) return tasks;
    const arr = [...tasks];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sort.key) {
        case "title": va = a.title.toLowerCase(); vb = b.title.toLowerCase(); break;
        case "status":
          va = statuses.find((s) => s.id === a.status_id)?.position ?? 999;
          vb = statuses.find((s) => s.id === b.status_id)?.position ?? 999;
          break;
        case "priority": {
          const ord = { low: 0, medium: 1, high: 2, urgent: 3 };
          va = ord[a.priority]; vb = ord[b.priority]; break;
        }
        case "due_date":
          va = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          vb = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          break;
        default:
          va = a.fieldValues[sort.key] ?? "";
          vb = b.fieldValues[sort.key] ?? "";
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [tasks, sort, statuses]);

  const groups = useMemo(() => {
    if (!groupByStatus) return [{ status: null as Status | null, tasks: sortedTasks }];
    const map = new Map<string, Task[]>();
    statuses.forEach((s) => map.set(s.id, []));
    const orphan: Task[] = [];
    sortedTasks.forEach((t) => {
      if (t.status_id && map.has(t.status_id)) map.get(t.status_id)!.push(t);
      else orphan.push(t);
    });
    const out = statuses.map((s) => ({ status: s, tasks: map.get(s.id) ?? [] }));
    if (orphan.length) out.push({ status: null as any, tasks: orphan });
    return out;
  }, [sortedTasks, statuses, groupByStatus]);

  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  // Total grid width for proper horizontal scroll
  const totalWidth = useMemo(() => {
    const base = DEFAULT_WIDTHS.done +
      (widths.title ?? DEFAULT_WIDTHS.title) +
      (widths.status ?? DEFAULT_WIDTHS.status) +
      (widths.priority ?? DEFAULT_WIDTHS.priority) +
      (widths.assignees ?? DEFAULT_WIDTHS.assignees) +
      (widths.due_date ?? DEFAULT_WIDTHS.due_date) +
      (widths.tags ?? DEFAULT_WIDTHS.tags);
    const fieldsW = fields.reduce((s, f) => s + (widths[f.id] ?? 160), 0);
    return base + fieldsW + 56 /* + button */ + 44 /* delete */;
  }, [widths, fields]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-4 px-6 lg:px-8 pt-6 pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{listName || "Lista"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={groupByStatus ? "secondary" : "outline"}
            size="sm" className="h-8"
            onClick={() => setGroupByStatus((v) => !v)}
          >
            {groupByStatus ? "Agrupado por status" : "Lista plana"}
          </Button>
          <div className="flex gap-1 rounded-md border p-0.5">
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}`}><LayoutList className="h-4 w-4 mr-1.5" />Lista</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/kanban`}><Trello className="h-4 w-4 mr-1.5" />Kanban</Link>
            </Button>
            <Button variant="secondary" size="sm" className="h-8">
              <TableIcon className="h-4 w-4 mr-1.5" />Tabela
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={`/list/${listId}/calendar`}><CalendarDays className="h-4 w-4 mr-1.5" />Calendário</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 lg:px-8 pb-6">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: totalWidth }}>
              {/* Header row (sticky) */}
              <TableHeaderRow
                widths={widths}
                setWidths={setWidths}
                fields={fields}
                sort={sort}
                onSort={toggleSort}
                onAddField={() => setNewFieldOpen(true)}
              />

              {groups.map((group, gi) => {
                const gKey = group.status?.id ?? "__none__";
                const isCollapsed = !!collapsed[gKey];
                return (
                  <div key={gKey + gi}>
                    {groupByStatus && (
                      <button
                        onClick={() => setCollapsed((c) => ({ ...c, [gKey]: !c[gKey] }))}
                        className="w-full sticky left-0 flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/70 border-b text-sm font-medium text-left"
                      >
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: group.status?.color ?? "#94a3b8" }}
                        />
                        <span>{group.status?.name ?? "Sem status"}</span>
                        <Badge variant="secondary" className="ml-1 h-5 font-normal">{group.tasks.length}</Badge>
                      </button>
                    )}

                    {!isCollapsed && group.tasks.map((task) => (
                      <TableRow
                        key={task.id}
                        task={task}
                        statuses={statuses}
                        fields={fields}
                        widths={widths}
                        members={members}
                        isDone={isDone(task)}
                        editingTitle={editingTitleId === task.id}
                        onStartTitleEdit={() => setEditingTitleId(task.id)}
                        onStopTitleEdit={() => setEditingTitleId(null)}
                        onOpen={() => setOpenTaskId(task.id)}
                        onToggleDone={() => toggleDone(task)}
                        onUpdate={(patch) => updateTask(task.id, patch)}
                        onAddAssignee={(uid) => addAssignee(task.id, uid)}
                        onRemoveAssignee={(uid) => removeAssignee(task.id, uid)}
                        onSetFieldValue={(fid, v) => setFieldValue(task.id, fid, v)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    ))}

                    {!isCollapsed && (
                      <AddTaskRow
                        statusId={group.status?.id ?? null}
                        onCreate={async (title) => { await createTask(title, group.status?.id ?? null); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={newFieldOpen} onOpenChange={setNewFieldOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo campo customizado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as CustomFieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFieldOpen(false)}>Cancelar</Button>
            <Button onClick={createField} disabled={!newFieldName.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDetailDialog
        taskId={openTaskId}
        listId={listId ?? ""}
        doneStatusId={doneStatusId}
        open={!!openTaskId}
        onOpenChange={(o) => { if (!o) setOpenTaskId(null); }}
      />
    </div>
  );
}

// ============== Header ==============
function TableHeaderRow({
  widths, setWidths, fields, sort, onSort, onAddField,
}: {
  widths: Record<string, number>;
  setWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  fields: CustomField[];
  sort: { key: string; dir: SortDir } | null;
  onSort: (k: string) => void;
  onAddField: () => void;
}) {
  const cols: { key: string; label: string; sortable?: boolean; w: number }[] = [
    { key: "done", label: "", w: DEFAULT_WIDTHS.done },
    { key: "title", label: "Tarefa", sortable: true, w: widths.title ?? DEFAULT_WIDTHS.title },
    { key: "status", label: "Status", sortable: true, w: widths.status ?? DEFAULT_WIDTHS.status },
    { key: "priority", label: "Prioridade", sortable: true, w: widths.priority ?? DEFAULT_WIDTHS.priority },
    { key: "assignees", label: "Responsáveis", w: widths.assignees ?? DEFAULT_WIDTHS.assignees },
    { key: "due_date", label: "Vencimento", sortable: true, w: widths.due_date ?? DEFAULT_WIDTHS.due_date },
    { key: "tags", label: "Tags", w: widths.tags ?? DEFAULT_WIDTHS.tags },
    ...fields.map((f) => ({
      key: f.id, label: f.name, sortable: true, w: widths[f.id] ?? 160,
    })),
  ];

  return (
    <div className="sticky top-0 z-10 flex bg-muted/40 border-b text-xs font-medium text-muted-foreground">
      {cols.map((c) => (
        <ColHeader
          key={c.key}
          width={c.w}
          label={c.label}
          sortable={c.sortable}
          sortDir={sort?.key === c.key ? sort.dir : null}
          onSort={c.sortable ? () => onSort(c.key) : undefined}
          onResize={c.key === "done" ? undefined : (w) => setWidths((p) => ({ ...p, [c.key]: w }))}
        />
      ))}
      <div className="w-14 flex items-center justify-center border-l">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddField} aria-label="Adicionar campo">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="w-11" />
    </div>
  );
}

function ColHeader({
  width, label, sortable, sortDir, onSort, onResize,
}: {
  width: number; label: string;
  sortable?: boolean;
  sortDir: SortDir | null;
  onSort?: () => void;
  onResize?: (w: number) => void;
}) {
  const startX = useRef(0);
  const startW = useRef(0);
  const dragging = useRef(false);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onResize) return;
    startX.current = e.clientX;
    startW.current = width;
    dragging.current = true;
    const move = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.max(60, startW.current + (ev.clientX - startX.current));
      onResize(next);
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      style={{ width, minWidth: width }}
      className="relative flex items-center px-3 py-2.5 border-r last:border-r-0 select-none"
    >
      <button
        type="button"
        onClick={sortable ? onSort : undefined}
        className={cn(
          "flex items-center gap-1 truncate",
          sortable && "hover:text-foreground cursor-pointer",
        )}
      >
        <span className="truncate">{label}</span>
        {sortable && (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" />
            : sortDir === "desc" ? <ArrowDown className="h-3 w-3" />
              : <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
      {onResize && (
        <div
          onMouseDown={onDown}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
        />
      )}
    </div>
  );
}

// ============== Row ==============
function TableRow({
  task, statuses, fields, widths, members, isDone, editingTitle,
  onStartTitleEdit, onStopTitleEdit, onOpen, onToggleDone, onUpdate,
  onAddAssignee, onRemoveAssignee, onSetFieldValue, onDelete,
}: {
  task: Task;
  statuses: Status[];
  fields: CustomField[];
  widths: Record<string, number>;
  members: AssigneeMember[];
  isDone: boolean;
  editingTitle: boolean;
  onStartTitleEdit: () => void;
  onStopTitleEdit: () => void;
  onOpen: () => void;
  onToggleDone: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onAddAssignee: (uid: string) => void;
  onRemoveAssignee: (uid: string) => void;
  onSetFieldValue: (fid: string, v: any) => void;
  onDelete: () => void;
}) {
  const status = statuses.find((s) => s.id === task.status_id);

  return (
    <div className={cn(
      "flex items-stretch border-b hover:bg-muted/30 transition-colors group",
      isDone && "opacity-60",
    )}>
      {/* Done checkbox */}
      <Cell width={DEFAULT_WIDTHS.done} className="justify-center">
        <Checkbox checked={isDone} onCheckedChange={() => onToggleDone()} />
      </Cell>

      {/* Title */}
      <Cell width={widths.title ?? DEFAULT_WIDTHS.title}>
        {editingTitle ? (
          <Input
            autoFocus
            defaultValue={task.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== task.title) onUpdate({ title: v });
              onStopTitleEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.currentTarget.blur(); }
              if (e.key === "Escape") onStopTitleEdit();
            }}
            className="h-7 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={onOpen}
            onDoubleClick={(e) => { e.stopPropagation(); onStartTitleEdit(); }}
            className={cn(
              "text-sm text-left w-full truncate hover:text-primary",
              isDone && "line-through",
            )}
            title={task.title}
          >
            {task.title}
          </button>
        )}
      </Cell>

      {/* Status */}
      <Cell width={widths.status ?? DEFAULT_WIDTHS.status}>
        <Select
          value={task.status_id ?? undefined}
          onValueChange={(v) => onUpdate({ status_id: v })}
        >
          <SelectTrigger className="h-7 border-0 shadow-none focus:ring-1 px-2">
            <SelectValue placeholder="—">
              {status && (
                <span className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color ?? "#94a3b8" }} />
                  <span className="truncate">{status.name}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color ?? "#94a3b8" }} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Cell>

      {/* Priority */}
      <Cell width={widths.priority ?? DEFAULT_WIDTHS.priority}>
        <Select
          value={task.priority}
          onValueChange={(v) => onUpdate({ priority: v as Priority })}
        >
          <SelectTrigger className="h-7 border-0 shadow-none focus:ring-1 px-2">
            <SelectValue>
              <Badge variant="outline" className={cn("font-normal text-[11px] py-0 h-5", priorityClass[task.priority])}>
                <span className="h-1.5 w-1.5 rounded-full mr-1" style={{
                  backgroundColor: `hsl(var(--priority-${task.priority}))`,
                }} />
                {priorityLabel[task.priority]}
              </Badge>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(priorityLabel) as Priority[]).map((p) => (
              <SelectItem key={p} value={p}>{priorityLabel[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Cell>

      {/* Assignees */}
      <Cell width={widths.assignees ?? DEFAULT_WIDTHS.assignees}>
        <AssigneeSelect
          members={members}
          selectedIds={task.assignees.map((a) => a.id)}
          onAdd={onAddAssignee}
          onRemove={onRemoveAssignee}
        />
      </Cell>

      {/* Due date */}
      <Cell width={widths.due_date ?? DEFAULT_WIDTHS.due_date}>
        <Input
          type="date"
          defaultValue={task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : ""}
          onChange={(e) => {
            const v = e.target.value ? new Date(e.target.value).toISOString() : null;
            onUpdate({ due_date: v });
          }}
          className="h-7 border-0 shadow-none focus-visible:ring-1 px-1 text-xs"
        />
      </Cell>

      {/* Tags */}
      <Cell width={widths.tags ?? DEFAULT_WIDTHS.tags}>
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-full text-left flex flex-wrap gap-1 min-h-[1.5rem]">
              {(task.tags ?? []).length > 0 ? (
                task.tags!.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal text-[10px] py-0 px-1.5 h-4">{t}</Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground/60">+ tags</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <TagsInput
              value={task.tags ?? []}
              onChange={(tags) => onUpdate({ tags })}
            />
          </PopoverContent>
        </Popover>
      </Cell>

      {/* Custom fields */}
      {fields.map((f) => (
        <Cell key={f.id} width={widths[f.id] ?? 160}>
          <CustomFieldCell
            field={f}
            value={task.fieldValues[f.id]}
            onChange={(v) => onSetFieldValue(f.id, v)}
          />
        </Cell>
      ))}

      {/* + field placeholder */}
      <div className="w-14 border-r" />

      {/* Delete */}
      <div className="w-11 flex items-center justify-center">
        <Button
          variant="ghost" size="icon"
          onClick={onDelete}
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          aria-label="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function Cell({
  width, children, className,
}: { width: number; children: React.ReactNode; className?: string }) {
  return (
    <div
      style={{ width, minWidth: width }}
      className={cn("flex items-center px-2 py-1.5 border-r overflow-hidden", className)}
    >
      {children}
    </div>
  );
}

function CustomFieldCell({
  field, value, onChange,
}: { field: CustomField; value: any; onChange: (v: any) => void }) {
  if (field.type === "checkbox") {
    return (
      <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          if (v !== value) onChange(v);
        }}
        className="h-7 border-0 shadow-none focus-visible:ring-1 px-1 text-xs"
      />
    );
  }
  if (field.type === "date") {
    return (
      <Input
        type="date"
        defaultValue={value ? String(value).slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-7 border-0 shadow-none focus-visible:ring-1 px-1 text-xs"
      />
    );
  }
  if (field.type === "select") {
    return (
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-7 border-0 shadow-none focus:ring-1 px-2 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  // text / url
  return (
    <Input
      type={field.type === "url" ? "url" : "text"}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const v = e.target.value;
        if (v !== (value ?? "")) onChange(v || null);
      }}
      className="h-7 border-0 shadow-none focus-visible:ring-1 px-1 text-xs"
    />
  );
}

// ============== Add task inline ==============
function AddTaskRow({ statusId: _statusId, onCreate }: {
  statusId: string | null;
  onCreate: (title: string) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [active, setActive] = useState(false);

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="w-full sticky left-0 flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b text-left"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) { setActive(false); return; }
        await onCreate(title);
        setTitle("");
        setActive(false);
      }}
      className="sticky left-0 flex items-center gap-2 px-3 py-1.5 border-b bg-background"
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={async () => {
          if (title.trim()) { await onCreate(title); setTitle(""); }
          setActive(false);
        }}
        placeholder="Título da tarefa, Enter para criar"
        className="h-7 text-sm max-w-md"
      />
      <Button type="submit" size="sm" variant="ghost" className="h-7" aria-label="Confirmar">
        <Check className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}
