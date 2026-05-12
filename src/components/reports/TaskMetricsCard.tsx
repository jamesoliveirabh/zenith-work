import { AlertTriangle, CheckCircle, Clock, Layers, ListTodo, UserX } from "lucide-react";
import { useTaskMetrics } from "@/hooks/useTaskMetrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface TaskMetricsCardProps {
  listId: string | undefined;
}

export function TaskMetricsCard({ listId }: TaskMetricsCardProps) {
  const { data: metrics, isLoading, error } = useTaskMetrics(listId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Métricas</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Erro ao carregar métricas.</AlertDescription>
      </Alert>
    );
  }
  if (!metrics) return null;

  const stats = [
    {
      label: "Total de tarefas",
      value: metrics.totalTasks,
      icon: <ListTodo className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: "Concluídas",
      value: `${metrics.completedTasks} (${metrics.completionPercentage}%)`,
      icon: <CheckCircle className="h-4 w-4 text-priority-low" />,
    },
    {
      label: "Bloqueadas",
      value: `${metrics.blockedTasks} (${metrics.blockedPercentage}%)`,
      icon: <AlertTriangle className="h-4 w-4 text-priority-medium" />,
    },
    {
      label: "Vencidas",
      value: metrics.overdueTasks,
      icon: <Clock className="h-4 w-4 text-destructive" />,
    },
    {
      label: "Sem responsável",
      value: metrics.tasksWithoutAssignee,
      icon: <UserX className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: "Subtasks / tarefa",
      value: metrics.avgSubtasksPerTask,
      icon: <Layers className="h-4 w-4 text-muted-foreground" />,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métricas do projeto</CardTitle>
        <CardDescription>Visão geral de tarefas e progresso</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {s.icon}
                <span>{s.label}</span>
              </div>
              <p className="text-2xl font-semibold mt-1.5 tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {metrics.overdueTasks > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {metrics.overdueTasks} tarefa(s) vencida(s) precisam de atenção.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Tempo médio de conclusão</p>
            <p className="font-semibold mt-1">
              {metrics.avgDaysToCompletion} {metrics.avgDaysToCompletion === 1 ? "dia" : "dias"}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Conclusão de subtasks</p>
            <p className="font-semibold mt-1">{metrics.subtaskCompletionPercentage}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
