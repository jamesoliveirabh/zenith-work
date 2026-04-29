import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis,
} from "recharts";
import { CheckCircle2, Clock, ListChecks, AlertTriangle } from "lucide-react";

interface TaskRow {
  id: string;
  status_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  assignee_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}
interface StatusRow { id: string; name: string; color: string | null; is_done: boolean; }
interface MemberRow { user_id: string; }
interface ProfileRow { id: string; display_name: string | null; email: string | null; }

const PRIORITY_COLORS: Record<string, string> = {
  low: "hsl(var(--muted-foreground))",
  medium: "hsl(var(--primary))",
  high: "hsl(35 92% 55%)",
  urgent: "hsl(var(--destructive))",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function fmtDay(d: Date) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

export default function Dashboard() {
  const { current, loading: wsLoading } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [{ data: t }, { data: s }, { data: m }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,status_id,priority,assignee_id,due_date,completed_at,created_at")
          .eq("workspace_id", current.id),
        supabase
          .from("status_columns")
          .select("id,name,color,is_done")
          .eq("workspace_id", current.id),
        supabase.from("workspace_members").select("user_id").eq("workspace_id", current.id),
      ]);
      const memberIds = (m ?? []).map((x: MemberRow) => x.user_id);
      let profMap: Record<string, ProfileRow> = {};
      if (memberIds.length) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", memberIds);
        (p ?? []).forEach((row: ProfileRow) => { profMap[row.id] = row; });
      }
      if (cancelled) return;
      setTasks((t ?? []) as TaskRow[]);
      setStatuses((s ?? []) as StatusRow[]);
      setProfiles(profMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [current?.id]);

  const stats = useMemo(() => {
    const doneStatusIds = new Set(statuses.filter((s) => s.is_done).map((s) => s.id));
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed_at || (t.status_id && doneStatusIds.has(t.status_id))).length;
    const open = total - completed;
    const now = Date.now();
    const overdue = tasks.filter(
      (t) => !t.completed_at && t.due_date && new Date(t.due_date).getTime() < now &&
             !(t.status_id && doneStatusIds.has(t.status_id))
    ).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, open, overdue, rate };
  }, [tasks, statuses]);

  const completionTrend = useMemo(() => {
    const days: { date: string; criadas: number; concluidas: number }[] = [];
    const today = startOfDay(new Date());
    const map = new Map<string, { criadas: number; concluidas: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { criadas: 0, concluidas: 0 });
      days.push({ date: fmtDay(d), criadas: 0, concluidas: 0 });
    }
    tasks.forEach((t) => {
      const cKey = t.created_at.slice(0, 10);
      if (map.has(cKey)) map.get(cKey)!.criadas++;
      if (t.completed_at) {
        const dKey = t.completed_at.slice(0, 10);
        if (map.has(dKey)) map.get(dKey)!.concluidas++;
      }
    });
    let i = 0;
    map.forEach((v) => { days[i].criadas = v.criadas; days[i].concluidas = v.concluidas; i++; });
    return days;
  }, [tasks]);

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.status_id) return;
      counts.set(t.status_id, (counts.get(t.status_id) ?? 0) + 1);
    });
    return statuses
      .map((s) => ({ name: s.name, value: counts.get(s.id) ?? 0, color: s.color ?? "hsl(var(--primary))" }))
      .filter((x) => x.value > 0);
  }, [tasks, statuses]);

  const priorityBreakdown = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    tasks.forEach((t) => { counts[t.priority] = (counts[t.priority] ?? 0) + 1; });
    return [
      { name: "Baixa", key: "low", value: counts.low },
      { name: "Média", key: "medium", value: counts.medium },
      { name: "Alta", key: "high", value: counts.high },
      { name: "Urgente", key: "urgent", value: counts.urgent },
    ];
  }, [tasks]);

  const assigneeBreakdown = useMemo(() => {
    const doneStatusIds = new Set(statuses.filter((s) => s.is_done).map((s) => s.id));
    const map = new Map<string, { open: number; done: number }>();
    tasks.forEach((t) => {
      if (!t.assignee_id) return;
      const isDone = !!t.completed_at || (t.status_id ? doneStatusIds.has(t.status_id) : false);
      const e = map.get(t.assignee_id) ?? { open: 0, done: 0 };
      if (isDone) e.done++; else e.open++;
      map.set(t.assignee_id, e);
    });
    return Array.from(map.entries())
      .map(([uid, v]) => ({
        name: profiles[uid]?.display_name || profiles[uid]?.email?.split("@")[0] || "—",
        Abertas: v.open,
        Concluídas: v.done,
      }))
      .sort((a, b) => (b.Abertas + b.Concluídas) - (a.Abertas + a.Concluídas))
      .slice(0, 8);
  }, [tasks, statuses, profiles]);

  const trendConfig: ChartConfig = {
    criadas: { label: "Criadas", color: "hsl(var(--muted-foreground))" },
    concluidas: { label: "Concluídas", color: "hsl(var(--primary))" },
  };
  const assigneeConfig: ChartConfig = {
    Abertas: { label: "Abertas", color: "hsl(var(--muted-foreground))" },
    Concluídas: { label: "Concluídas", color: "hsl(var(--primary))" },
  };

  if (wsLoading) return null;
  if (!current) return <Navigate to="/onboarding" replace />;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{current.name}</h1>
        <p className="text-muted-foreground mt-1">Visão geral de produtividade dos últimos 14 dias.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard icon={ListChecks} label="Total de tarefas" value={stats.total} loading={loading} />
        <KpiCard icon={CheckCircle2} label="Concluídas" value={stats.completed} hint={`${stats.rate}% de conclusão`} loading={loading} />
        <KpiCard icon={Clock} label="Em aberto" value={stats.open} loading={loading} />
        <KpiCard icon={AlertTriangle} label="Atrasadas" value={stats.overdue} tone="destructive" loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Criadas vs concluídas</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[240px] w-full" /> : (
              <ChartContainer config={trendConfig} className="h-[240px] w-full">
                <LineChart data={completionTrend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="criadas" stroke="var(--color-criadas)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="concluidas" stroke="var(--color-concluidas)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por status</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[240px] w-full" /> : statusBreakdown.length === 0 ? (
              <EmptyState text="Nenhuma tarefa ainda" />
            ) : (
              <ChartContainer config={{}} className="h-[240px] w-full">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
            {!loading && statusBreakdown.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3 text-xs">
                {statusBreakdown.map((s) => (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por prioridade</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[240px] w-full" /> : (
              <ChartContainer config={{}} className="h-[240px] w-full">
                <BarChart data={priorityBreakdown} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {priorityBreakdown.map((d) => <Cell key={d.key} fill={PRIORITY_COLORS[d.key]} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Carga por responsável</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[240px] w-full" /> : assigneeBreakdown.length === 0 ? (
              <EmptyState text="Nenhuma tarefa atribuída" />
            ) : (
              <ChartContainer config={assigneeConfig} className="h-[240px] w-full">
                <BarChart data={assigneeBreakdown} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} fontSize={11} width={90} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="Abertas" stackId="a" fill="var(--color-Abertas)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Concluídas" stackId="a" fill="var(--color-Concluídas)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, hint, tone, loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; hint?: string;
  tone?: "destructive"; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className={`h-8 w-8 rounded-md flex items-center justify-center ${
            tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"
          }`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-3" />
        ) : (
          <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
        )}
        {hint && !loading && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
