import { useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, Calendar as CalendarIcon, ChevronRight, Loader2, Plus,
  CheckCircle2, MessageSquare, Paperclip, FolderPlus, Hash, UserPlus,
  Edit3, ListChecks, Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  type ActivityLog, type DashboardTask, type MyTasksGrouped,
  type PriorityBucket, type SpaceProgress, type WeeklyActivityPoint,
  useActivityFeed, useMyTasks, useOverdueTasks, usePriorityOverview,
  useSpaceProgress, useWeeklyActivity,
} from "@/hooks/useDashboard";
import { useGoals } from "@/hooks/useGoals";

interface BaseProps {
  workspaceId: string;
  onOpenTask: (taskId: string, listId: string) => void;
}

function WidgetCard({
  title, icon: Icon, action, children, className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      <div className="flex-1 p-3 overflow-y-auto max-h-[480px]">{children}</div>
    </div>
  );
}

const PRIORITY_DOT: Record<PriorityBucket["priority"], string> = {
  urgent: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};
const PRIORITY_COLOR: Record<PriorityBucket["priority"], string> = {
  urgent: "hsl(var(--destructive))",
  high: "hsl(35 92% 55%)",
  medium: "hsl(45 93% 50%)",
  low: "hsl(217 91% 60%)",
};
const PRIORITY_LABEL: Record<PriorityBucket["priority"], string> = {
  urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa",
};

function TaskRow({ task, onOpen }: { task: DashboardTask; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors group"
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: task.status_color ?? "hsl(var(--muted-foreground))" }}
        title={task.status_name ?? ""}
      />
      <span className="flex-1 min-w-0">
        <div className="text-sm truncate group-hover:text-primary">{task.title}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {task.space_name && <>{task.space_name} › </>}{task.list_name}
        </div>
      </span>
      {task.due_date && (
        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 shrink-0">
          <CalendarIcon className="h-3 w-3" />
          {format(new Date(task.due_date), "dd MMM", { locale: ptBR })}
        </span>
      )}
    </button>
  );
}

export function MyTasksWidget({
  userId, workspaceId, onOpenTask,
}: BaseProps & { userId: string }) {
  const { data, isLoading } = useMyTasks(userId, workspaceId);
  const groups: { label: string; tone?: string; items: DashboardTask[] }[] = useMemo(() => {
    const d: MyTasksGrouped = data ?? { overdue: [], today: [], thisWeek: [], future: [], all: [] };
    return [
      { label: "Atrasadas", tone: "text-destructive", items: d.overdue },
      { label: "Hoje", items: d.today },
      { label: "Esta semana", items: d.thisWeek },
      { label: "Futuras", items: d.future },
    ].filter((g) => g.items.length > 0);
  }, [data]);

  const totalShown = (data?.all ?? []).length;
  const totalAll = (data?.overdue.length ?? 0) + (data?.today.length ?? 0) +
    (data?.thisWeek.length ?? 0) + (data?.future.length ?? 0);

  return (
    <WidgetCard
      title="Minhas tarefas"
      icon={ListChecks}
      action={totalAll > 15 && (
        <span className="text-[11px] text-muted-foreground">{totalShown}/{totalAll}</span>
      )}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-6" />
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Nenhuma tarefa atribuída a você 🎉</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.label}>
              <h4 className={cn("text-[11px] uppercase tracking-wide font-medium mb-1 px-2", g.tone ?? "text-muted-foreground")}>
                {g.label} <span className="text-muted-foreground/70">({g.items.length})</span>
              </h4>
              <div className="space-y-0.5">
                {g.items.slice(0, 8).map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={() => onOpenTask(t.id, t.list_id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

export function OverdueTasksWidget({ workspaceId, onOpenTask }: BaseProps) {
  const { data = [], isLoading } = useOverdueTasks(workspaceId);
  return (
    <WidgetCard title="Tarefas atrasadas" icon={AlertTriangle}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-6" />
      ) : (
        <>
          <div className="text-center py-2">
            <div className={cn("text-3xl font-bold", data.length > 0 ? "text-destructive" : "text-muted-foreground")}>
              {data.length}
            </div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {data.length === 1 ? "atrasada" : "atrasadas"}
            </div>
          </div>
          <div className="space-y-0.5 mt-2">
            {data.slice(0, 12).map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => onOpenTask(t.id, t.list_id)} />
            ))}
            {data.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhuma tarefa atrasada ✓</p>
            )}
          </div>
        </>
      )}
    </WidgetCard>
  );
}

const ACTIVITY_ICONS: Record<ActivityLog["action"], React.ComponentType<{ className?: string }>> = {
  task_created: Plus,
  task_updated: Edit3,
  task_deleted: AlertTriangle,
  task_completed: CheckCircle2,
  task_assigned: UserPlus,
  comment_created: MessageSquare,
  attachment_added: Paperclip,
  list_created: ListChecks,
  space_created: FolderPlus,
  member_joined: UserPlus,
};

const ACTIVITY_VERB: Record<ActivityLog["action"], string> = {
  task_created: "criou a tarefa",
  task_updated: "atualizou a tarefa",
  task_deleted: "excluiu a tarefa",
  task_completed: "concluiu a tarefa",
  task_assigned: "atribuiu a tarefa",
  comment_created: "comentou em",
  attachment_added: "anexou em",
  list_created: "criou a lista",
  space_created: "criou o space",
  member_joined: "entrou no workspace",
};

export function ActivityFeedWidget({ workspaceId }: BaseProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityFeed(workspaceId);
  const events = useMemo(() => data?.pages.flat() ?? [], [data]);

  return (
    <WidgetCard title="Atividade recente" icon={Hash}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-6" />
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Sem atividade ainda</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {events.map((e) => {
              const Icon = ACTIVITY_ICONS[e.action];
              const name = e.actor?.display_name || e.actor?.email || "Alguém";
              const initial = name.charAt(0).toUpperCase();
              return (
                <li key={e.id} className="flex gap-2 items-start text-xs">
                  <Avatar className="h-6 w-6 shrink-0">
                    {e.actor?.avatar_url && <AvatarImage src={e.actor.avatar_url} />}
                    <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="leading-snug">
                      <span className="font-medium">{name}</span>{" "}
                      <span className="text-muted-foreground">{ACTIVITY_VERB[e.action]}</span>{" "}
                      {e.entity_title && (
                        <span className="font-medium">{e.entity_title}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                      <Icon className="h-3 w-3" />
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasNextPage && (
            <div className="text-center mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-xs h-7"
              >
                {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin" /> : "Carregar mais"}
              </Button>
            </div>
          )}
        </>
      )}
    </WidgetCard>
  );
}

export function SpaceProgressWidget({ workspaceId }: BaseProps) {
  const { data = [], isLoading } = useSpaceProgress(workspaceId);
  return (
    <WidgetCard title="Progresso dos Spaces" icon={FolderPlus}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-6" />
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Nenhum space ainda</p>
      ) : (
        <ul className="space-y-3">
          {data.map((s: SpaceProgress) => {
            const pct = s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100);
            return (
              <li key={s.space_id}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color ?? "#6366f1" }}
                  />
                  <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {s.completed}/{s.total}
                  </span>
                </div>
                <Progress value={pct} className="h-1.5" />
                <div className="text-[10px] text-muted-foreground text-right mt-0.5">{pct}%</div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

export function PriorityOverviewWidget({ workspaceId }: BaseProps) {
  const { data = [], isLoading } = usePriorityOverview(workspaceId);
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const chartData = data.filter((d) => d.count > 0).map((d) => ({
    name: PRIORITY_LABEL[d.priority],
    value: d.count,
    color: PRIORITY_COLOR[d.priority],
  }));

  return (
    <WidgetCard title="Tarefas por prioridade" icon={AlertTriangle}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-6" />
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Nenhuma tarefa em aberto</p>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-full h-44 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-2xl font-bold leading-none">{total}</div>
                <div className="text-[10px] text-muted-foreground uppercase">em aberto</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 w-full text-xs">
            {data.map((d) => (
              <div key={d.priority} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[d.priority])} />
                <span>{PRIORITY_LABEL[d.priority]}</span>
                <span className="ml-auto text-muted-foreground">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export function WeeklyActivityWidget({ workspaceId }: BaseProps) {
  const { data = [], isLoading } = useWeeklyActivity(workspaceId);
  const chartData = useMemo(
    () =>
      data.map((d: WeeklyActivityPoint) => ({
        ...d,
        label: format(new Date(d.date + "T00:00:00"), "EEE", { locale: ptBR }),
      })),
    [data],
  );

  return (
    <WidgetCard title="Atividade da semana" icon={CalendarIcon}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-6" />
      ) : (
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="created" name="Criadas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completed" name="Concluídas" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </WidgetCard>
  );
}

void ChevronRight;
void Link;

export function GoalsOverviewWidget({ workspaceId }: BaseProps) {
  const { data: goals = [], isLoading } = useGoals(workspaceId, "all");
  const top = goals.slice(0, 5);
  return (
    <WidgetCard title="Goals" icon={Target}>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : top.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum goal ativo.</p>
      ) : (
        <div className="space-y-3">
          {top.map((g) => {
            const p = g.progress ?? 0;
            const tone = p >= 70 ? "bg-emerald-500" : p >= 40 ? "bg-amber-500" : "bg-rose-500";
            return (
              <Link key={g.id} to={`/goals/${g.id}`} className="block hover:bg-muted/50 rounded p-2 -mx-2 transition">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-sm font-medium truncate flex-1">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{p.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full transition-all", tone)} style={{ width: `${p}%` }} />
                </div>
              </Link>
            );
          })}
          {goals.length > 5 && (
            <Link to="/goals" className="text-xs text-primary hover:underline block pt-1">Ver todos →</Link>
          )}
        </div>
      )}
    </WidgetCard>
  );
}
