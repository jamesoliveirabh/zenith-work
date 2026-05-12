import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useVelocity } from "@/hooks/useVelocity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VelocityChartProps {
  listId: string | undefined;
  weeks?: number;
}

export function VelocityChart({ listId, weeks = 4 }: VelocityChartProps) {
  const { data, isLoading, error } = useVelocity(listId, weeks);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Velocity</CardTitle>
        <CardDescription>Tarefas concluídas por semana (últimas {weeks})</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>Erro ao carregar gráfico.</AlertDescription>
          </Alert>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem dados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" name="Concluídas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="average"
                name="Média"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
