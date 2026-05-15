import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import type { Sprint, SprintTask } from "@/hooks/useSprints";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props { sprint: Sprint; tasks: SprintTask[]; }

export function SprintBurndownChart({ sprint, tasks }: Props) {
  const data = useMemo(() => {
    const start = startOfDay(parseISO(sprint.start_date));
    const end = startOfDay(parseISO(sprint.end_date));
    const days = eachDayOfInterval({ start, end });
    const total = tasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
    const totalDays = Math.max(1, differenceInCalendarDays(end, start));
    const today = startOfDay(new Date());

    return days.map((d, i) => {
      const completedByDay = tasks.reduce((sum, t) => {
        if (t.completed_at && startOfDay(parseISO(t.completed_at)) <= d) {
          return sum + (t.story_points ?? 0);
        }
        return sum;
      }, 0);
      const remaining = total - completedByDay;
      const ideal = Math.max(0, total - Math.round((total * i) / totalDays));
      return {
        label: format(d, "dd/MM"),
        ideal,
        remaining: d <= today ? remaining : null,
      };
    });
  }, [sprint, tasks]);

  const totalPoints = tasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
  const donePoints = tasks
    .filter((t) => t.status_in_sprint === "done")
    .reduce((s, t) => s + (t.story_points ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Burndown</CardTitle>
        <CardDescription>{donePoints} de {totalPoints} pontos concluídos</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="bd-rem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Line type="monotone" dataKey="ideal" name="Ideal" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
            <Area type="monotone" dataKey="remaining" name="Restante" stroke="hsl(var(--primary))" fill="url(#bd-rem)" strokeWidth={2} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
