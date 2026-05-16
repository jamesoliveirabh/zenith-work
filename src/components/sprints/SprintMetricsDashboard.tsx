import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSprintMetrics } from "@/hooks/useSprintAnalytics";
import { useSprintTasks, type Sprint } from "@/hooks/useSprints";
import { AlertTriangle, CheckCircle2, Clock, Users } from "lucide-react";

interface Props { sprint: Sprint }

export function SprintMetricsDashboard({ sprint }: Props) {
  const { data: metrics = [] } = useSprintMetrics(sprint.id);
  const { data: tasks = [] } = useSprintTasks(sprint.id);

  const latest = metrics[metrics.length - 1];

  const totalPoints = tasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
  const donePoints = tasks.filter((t) => t.status_in_sprint === "done").reduce((s, t) => s + (t.story_points ?? 0), 0);
  const completionPct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  const capacity = useMemo(() => {
    const map = new Map<string, number>();
    // best-effort: by status_in_sprint
    tasks.forEach((t) => {
      const k = t.status_in_sprint;
      map.set(k, (map.get(k) ?? 0) + (t.story_points ?? 0));
    });
    return Array.from(map.entries());
  }, [tasks]);

  const blocked = tasks.filter((t) => (t.status_in_sprint as string) === "blocked").length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Taxa de conclusão
          </CardTitle>
          <CardDescription>{donePoints} de {totalPoints} pontos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold mb-2">{completionPct}%</div>
          <Progress value={completionPct} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Distribuição por status
          </CardTitle>
          <CardDescription>Story points alocados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {capacity.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
          {capacity.map(([status, pts]) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <span className="capitalize">{status.replace("_", " ")}</span>
              <Badge variant="secondary">{pts}pt</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Performance diária
          </CardTitle>
          <CardDescription>Último snapshot</CardDescription>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-xs text-muted-foreground">Sem snapshots ainda. Os dados aparecem quando uma tarefa muda de status.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Velocity</span><span className="font-medium">{latest.velocity_percentage}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Média pts/tarefa</span><span className="font-medium">{latest.avg_points_per_task}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tarefas concluídas</span><span className="font-medium">{latest.task_completion_rate}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Em progresso</span><span className="font-medium">{latest.points_in_progress}pt</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Bloqueios
          </CardTitle>
          <CardDescription>Atenção necessária</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{blocked}</div>
          <p className="text-xs text-muted-foreground mt-1">tarefas bloqueadas</p>
        </CardContent>
      </Card>
    </div>
  );
}
