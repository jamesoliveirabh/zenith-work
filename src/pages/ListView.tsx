import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarDays, CalendarIcon, GanttChart, LayoutList, Loader2, MessageSquare, Paperclip, Plus,
  Table as TableIcon, Trash2, Trello,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { ListFilterBar, applyFilters, EMPTY_FILTERS, type ListFilters } from "@/components/ListFilterBar";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { useStatuses } from "@/hooks/useStatuses";
import {
  useCreateTask, useDeleteTask, useTasks, useUpdateTask, useUpdateTaskAssigneesInList,
} from "@/hooks/useTasks";
import { useListMembers } from "@/hooks/useListMembers";
import { useTaskTimeTotals } from "@/hooks/useTimeTracking";
import { TaskTimeCell } from "@/components/TaskTimeCell";
import type { Priority, Task } from "@/types/task";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

const priorityLabel: Record<Priority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};
const priorityClass: Record<Priority, string> = {
  low: "bg-priority-low/15 text-priority-low border-priority-low/30",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
  urgent: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30",
};

export default function ListView() {
  const { listId } = useParams<{ listId: string }>();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [newTitle, setNewTitle] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);

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
  const { data: tasks = [], isLoading: tasksLoading } = useTasks(listId);
  const { data: members = [] } = useListMembers(current?.id);
  const { data: timeTotals = {} } = useTaskTimeTotals(listId);

  const createTask = useCreateTask(listId ?? "");
  const updateTask = useUpdateTask(listId ?? "");
  const deleteTask = useDeleteTask(listId ?? "");
  const updateAssignees = useUpdateTaskAssigneesInList(listId ?? "");

  const defaultStatusId = useMemo(() => statuses[0]?.id ?? null, [statuses]);
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => (t.tags ?? []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tasks]);

  const visibleTasks = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !listId || !current || !user) return;
    await createTask.mutateAsync({
      workspace_id: current.id,
      title: newTitle.trim(),
      status_id: defaultStatusId,
      created_by: user.id,
      position: tasks.length,
    });
    setNewTitle("");
  };

  if (statusesLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{listName || "Lista"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {visibleTasks.length === tasks.length
              ? `${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"}`
              : `${visibleTasks.length} de ${tasks.length} tarefas`}
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button variant="secondary" size="sm" className="h-8">
            <LayoutList className="h-4 w-4 mr-1.5" />Lista
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
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link to={`/list/${listId}/gantt`}><GanttChart className="h-4 w-4 mr-1.5" />Gantt</Link>
          </Button>
        </div>
      </header>

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

      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="+ Adicionar tarefa..."
          className="flex-1"
        />
        <Button type="submit" disabled={createTask.isPending || !newTitle.trim()}>
          {createTask.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Plus className="h-4 w-4 mr-1" />Adicionar</>}
        </Button>
      </form>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px_140px_140px_120px_40px_40px] gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b bg-muted/30">
          <div>Tarefa</div>
          <div>Status</div>
          <div>Prioridade</div>
          <div>Responsáveis</div>
          <div>Vencimento</div>
          <div>Tempo</div>
          <div />
          <div />
        </div>

        {tasks.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhuma tarefa ainda. Adicione a primeira acima.
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhuma tarefa corresponde aos filtros.
          </div>
        ) : (
          visibleTasks.map((task: Task) => {
            const status = statuses.find((s) => s.id === task.status_id);
            return (
              <div
                key={task.id}
                className="grid grid-cols-[1fr_140px_120px_140px_140px_120px_40px_40px] gap-2 px-4 py-2 items-center border-b last:border-b-0 hover:bg-muted/30 transition-colors group"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      defaultValue={task.title}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== task.title) updateTask.mutate({ id: task.id, patch: { title: v } });
                      }}
                      className="border-0 shadow-none focus-visible:ring-1 h-8 px-2"
                    />
                    {(task.attachment_count ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0 pr-1"
                        title={`${task.attachment_count} anexo(s)`}
                      >
                        <Paperclip className="h-3 w-3" />
                        {task.attachment_count}
                      </span>
                    )}
                  </div>
                  {task.description_text && (
                    <p className="text-xs text-muted-foreground/70 px-2 mt-0.5 line-clamp-2">
                      {task.description_text}
                    </p>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-2 mt-0.5">
                      {task.tags.map((t) => (
                        <Badge key={t} variant="outline" className="font-normal text-[10px] py-0 px-1.5 h-4">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Select
                  value={task.status_id ?? undefined}
                  onValueChange={(v) => updateTask.mutate({ id: task.id, patch: { status_id: v } })}
                >
                  <SelectTrigger className="h-8 border-0 shadow-none focus:ring-1">
                    <SelectValue placeholder="—">
                      {status && (
                        <span className="flex items-center gap-2">
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
                <Select
                  value={task.priority}
                  onValueChange={(v) => updateTask.mutate({ id: task.id, patch: { priority: v as Priority } })}
                >
                  <SelectTrigger className="h-8 border-0 shadow-none focus:ring-1">
                    <SelectValue>
                      <Badge variant="outline" className={cn("font-normal", priorityClass[task.priority])}>
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
                <div className="px-2">
                  <AssigneeSelect
                    members={members}
                    selectedIds={task.assignees.map((a) => a.id)}
                    onAdd={(uid) => {
                      const u = members.find((m) => m.id === uid);
                      if (!u || !current) return;
                      updateAssignees.mutate({ taskId: task.id, workspaceId: current.id, add: { user: u } });
                    }}
                    onRemove={(uid) => {
                      if (!current) return;
                      updateAssignees.mutate({ taskId: task.id, workspaceId: current.id, remove: { userId: uid } });
                    }}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-2">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <Input
                    type="date"
                    defaultValue={task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : ""}
                    onChange={(e) => {
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      updateTask.mutate({ id: task.id, patch: { due_date: v } });
                    }}
                    className="h-8 border-0 shadow-none focus-visible:ring-1 px-1 text-xs"
                  />
                </div>
                <div className="px-2">
                  <TaskTimeCell
                    trackedSeconds={timeTotals[task.id] ?? 0}
                    estimateSeconds={task.time_estimate_seconds ?? null}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpenTaskId(task.id)}
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  aria-label="Abrir detalhes"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTask.mutate(task.id)}
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })
        )}
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
