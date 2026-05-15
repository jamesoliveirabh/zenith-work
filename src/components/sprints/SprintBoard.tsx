import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import {
  FIBONACCI, type Sprint, type SprintTask, type SprintTaskStatus,
  useSprintTasks, useUpdateSprintTask, useRemoveSprintTask, useAddTaskToSprint,
} from "@/hooks/useSprints";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const COLUMNS: { id: SprintTaskStatus; label: string }[] = [
  { id: "todo", label: "A fazer" },
  { id: "in_progress", label: "Em progresso" },
  { id: "done", label: "Concluído" },
];

interface Props {
  sprint: Sprint;
  canEdit: boolean;
}

export function SprintBoard({ sprint, canEdit }: Props) {
  const { data: tasks = [] } = useSprintTasks(sprint.id);
  const updateTask = useUpdateSprintTask();
  const removeTask = useRemoveSprintTask();
  const [editing, setEditing] = useState<SprintTask | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<SprintTaskStatus, SprintTask[]> = { todo: [], in_progress: [], done: [] };
    tasks.forEach((t) => out[t.status_in_sprint].push(t));
    return out;
  }, [tasks]);

  const onDragStart = (e: React.DragEvent, t: SprintTask) => {
    e.dataTransfer.setData("text/plain", t.id);
  };

  const onDrop = (e: React.DragEvent, col: SprintTaskStatus) => {
    e.preventDefault();
    if (!canEdit) return;
    const id = e.dataTransfer.getData("text/plain");
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status_in_sprint === col) return;
    updateTask.mutate({ id: t.id, sprint_id: sprint.id, patch: { status_in_sprint: col } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sprint Board</h3>
          {sprint.goal && <p className="text-sm text-muted-foreground">🎯 {sprint.goal}</p>}
        </div>
        {canEdit && sprint.status !== "completed" && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar tarefa
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = grouped[col.id];
          const totalPts = colTasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
          return (
            <Card
              key={col.id}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={(e) => onDrop(e, col.id)}
              className="min-h-[300px]"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{col.label}</span>
                  <Badge variant="secondary">{colTasks.length} · {totalPts}pt</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {colTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Vazio</p>
                )}
                {colTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable={canEdit}
                    onDragStart={(e) => onDragStart(e, t)}
                    onClick={() => canEdit && setEditing(t)}
                    className="rounded-md border bg-card p-3 text-sm hover:border-primary/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2">{t.task?.title ?? "Tarefa"}</span>
                      {t.story_points != null && (
                        <Badge variant="outline" className="shrink-0">{t.story_points}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.task?.title}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Story Points (Fibonacci)</label>
                <Select
                  value={String(editing.story_points ?? "")}
                  onValueChange={(v) =>
                    updateTask.mutate({
                      id: editing.id,
                      sprint_id: sprint.id,
                      patch: { story_points: v ? Number(v) : null },
                    })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Não estimado" /></SelectTrigger>
                  <SelectContent>
                    {FIBONACCI.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <Select
                  value={editing.status_in_sprint}
                  onValueChange={(v) =>
                    updateTask.mutate({
                      id: editing.id, sprint_id: sprint.id,
                      patch: { status_in_sprint: v as SprintTaskStatus },
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="justify-between sm:justify-between">
            {editing && (
              <Button
                variant="destructive" size="sm"
                onClick={() => {
                  removeTask.mutate({ id: editing.id, sprint_id: sprint.id });
                  setEditing(null);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        sprintId={sprint.id}
        teamId={sprint.team_id}
        existingTaskIds={tasks.map((t) => t.task_id)}
      />
    </div>
  );
}

interface AddProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sprintId: string;
  teamId: string;
  existingTaskIds: string[];
}

function AddTaskDialog({ open, onOpenChange, sprintId, teamId, existingTaskIds }: AddProps) {
  const { current } = useWorkspace();
  const addTask = useAddTaskToSprint();
  const [taskId, setTaskId] = useState<string>("");
  const [points, setPoints] = useState<string>("");

  const { data: tasks = [] } = useQuery({
    queryKey: ["team-tasks-for-sprint", teamId, current?.id],
    enabled: open && !!current?.id,
    queryFn: async () => {
      const { data: spaces } = await supabase
        .from("spaces").select("id").eq("team_id", teamId);
      const spaceIds = (spaces ?? []).map((s) => s.id);
      if (spaceIds.length === 0) return [];
      const { data: lists } = await supabase
        .from("lists").select("id").in("space_id", spaceIds);
      const listIds = (lists ?? []).map((l) => l.id);
      if (listIds.length === 0) return [];
      const { data } = await supabase
        .from("tasks").select("id, title").in("list_id", listIds).limit(200);
      return data ?? [];
    },
  });

  const available = tasks.filter((t) => !existingTaskIds.includes(t.id));

  const submit = async () => {
    if (!taskId) return;
    await addTask.mutateAsync({
      sprint_id: sprintId,
      task_id: taskId,
      story_points: points ? Number(points) : null,
    });
    setTaskId(""); setPoints(""); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar tarefa à sprint</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Tarefa</label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {available.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">Nenhuma tarefa disponível</div>}
                {available.map((t) => (<SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Story Points</label>
            <Select value={points} onValueChange={setPoints}>
              <SelectTrigger><SelectValue placeholder="Não estimado" /></SelectTrigger>
              <SelectContent>
                {FIBONACCI.map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!taskId}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
