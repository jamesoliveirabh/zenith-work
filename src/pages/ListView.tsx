import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, LayoutList, Loader2, MessageSquare, Plus, Trash2, Trello } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";
interface Status { id: string; name: string; color: string | null; is_done: boolean; position: number; }
interface Task {
  id: string;
  title: string;
  status_id: string | null;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  tags: string[] | null;
}

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
  const [listName, setListName] = useState<string>("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = async () => {
    if (!listId) return;
    setLoading(true);
    const [{ data: list }, { data: st }, { data: tk }] = await Promise.all([
      supabase.from("lists").select("name").eq("id", listId).maybeSingle(),
      supabase.from("status_columns").select("id,name,color,is_done,position").eq("list_id", listId).order("position"),
      supabase.from("tasks").select("id,title,status_id,priority,assignee_id,due_date,position,created_at,tags")
        .eq("list_id", listId).is("parent_task_id", null).order("position").order("created_at"),
    ]);
    setListName(list?.name ?? "");
    setStatuses(st ?? []);
    setTasks((tk ?? []) as Task[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [listId]);

  const defaultStatusId = useMemo(() => statuses[0]?.id ?? null, [statuses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !listId || !current || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from("tasks").insert({
      list_id: listId,
      workspace_id: current.id,
      title: newTitle.trim(),
      status_id: defaultStatusId,
      created_by: user.id,
      position: tasks.length,
    }).select("id,title,status_id,priority,assignee_id,due_date,position,created_at,tags").single();
    setCreating(false);
    if (error) return toast.error(error.message);
    setNewTitle("");
    if (data) setTasks((p) => [...p, data as Task]);
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };

  const deleteTask = async (id: string) => {
    setTasks((p) => p.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{listName || "Lista"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button variant="secondary" size="sm" className="h-8">
            <LayoutList className="h-4 w-4 mr-1.5" />Lista
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link to={`/list/${listId}/kanban`}><Trello className="h-4 w-4 mr-1.5" />Kanban</Link>
          </Button>
        </div>
      </header>

      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="+ Adicionar tarefa..."
          className="flex-1"
        />
        <Button type="submit" disabled={creating || !newTitle.trim()}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Adicionar</>}
        </Button>
      </form>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px_140px_40px_40px] gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b bg-muted/30">
          <div>Tarefa</div>
          <div>Status</div>
          <div>Prioridade</div>
          <div>Vencimento</div>
          <div />
          <div />
        </div>

        {tasks.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhuma tarefa ainda. Adicione a primeira acima.
          </div>
        ) : (
          tasks.map((task) => {
            const status = statuses.find((s) => s.id === task.status_id);
            return (
              <div
                key={task.id}
                className="grid grid-cols-[1fr_140px_120px_140px_40px_40px] gap-2 px-4 py-2 items-center border-b last:border-b-0 hover:bg-muted/30 transition-colors group"
              >
                <div>
                  <Input
                    defaultValue={task.title}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== task.title) updateTask(task.id, { title: v });
                    }}
                    className="border-0 shadow-none focus-visible:ring-1 h-8 px-2"
                  />
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
                  onValueChange={(v) => updateTask(task.id, { status_id: v })}
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
                  onValueChange={(v) => updateTask(task.id, { priority: v as Priority })}
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
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-2">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <Input
                    type="date"
                    defaultValue={task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : ""}
                    onChange={(e) => {
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      updateTask(task.id, { due_date: v });
                    }}
                    className="h-8 border-0 shadow-none focus-visible:ring-1 px-1 text-xs"
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
                  onClick={() => deleteTask(task.id)}
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
