import { useMemo } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useVelocityHistory } from "@/hooks/useSprints";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props { teamId: string | null | undefined; }

export function SprintVelocityChart({ teamId }: Props) {
  const { data, isLoading } = useVelocityHistory(teamId);

  const chartData = useMemo(() => {
    const last = (data ?? []).slice(-5);
    return last.map((r, i, arr) => {
      const window = arr.slice(Math.max(0, i - 2), i + 1);
      const avg = window.reduce((s, w) => s + w.actual_velocity, 0) / Math.max(1, window.length);
      return {
        label: r.sprint?.name ?? "—",
        planned: r.planned_velocity,
        actual: r.actual_velocity,
        average: Math.round(avg * 10) / 10,
      };
    });
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Velocity</CardTitle>
        <CardDescription>Histórico das últimas sprints concluídas</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem sprints concluídas ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8, fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="planned" name="Planejado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Entregue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="average" name="Média móvel" stroke="hsl(var(--accent-foreground))" strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
