import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCodeQualityMetrics } from "@/hooks/useTechQuality";
import { format, parseISO } from "date-fns";

interface Props { teamId: string }

export function QualityMetricsDashboard({ teamId }: Props) {
  const { data: metrics = [] } = useCodeQualityMetrics(teamId);
  const latest = metrics[metrics.length - 1];

  const tone = (val: number | null | undefined, t1: number, t2: number) => {
    if (val == null) return "text-muted-foreground";
    if (val >= t1) return "text-emerald-600";
    if (val >= t2) return "text-amber-600";
    return "text-destructive";
  };

  const chartData = metrics.map((m) => ({
    label: format(parseISO(m.date), "dd/MM"),
    coverage: m.test_coverage_percentage ?? 0,
    lint: m.linting_issues,
    smells: m.code_smells,
    vulns: m.security_vulnerabilities,
  }));

  if (metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Qualidade de Código</CardTitle>
          <CardDescription>Conecte SonarQube ou um pipeline de CI para popular as métricas.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhuma métrica registrada ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Cobertura</p>
          <p className={`text-2xl font-bold ${tone(latest.test_coverage_percentage, 80, 60)}`}>
            {latest.test_coverage_percentage ?? "—"}%
          </p>
          {latest.test_coverage_percentage != null && <Progress value={latest.test_coverage_percentage} className="mt-2" />}
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Lint issues</p>
          <p className="text-2xl font-bold">{latest.linting_issues}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Code smells</p>
          <p className="text-2xl font-bold">{latest.code_smells}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Vulnerabilidades</p>
          <p className={`text-2xl font-bold ${latest.security_vulnerabilities > 0 ? "text-destructive" : "text-emerald-600"}`}>
            {latest.security_vulnerabilities}
          </p>
          {latest.source && <Badge variant="outline" className="mt-2 text-[10px]">{latest.source}</Badge>}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendências</CardTitle>
          <CardDescription>Histórico das principais métricas</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="coverage" name="Cobertura %" stroke="hsl(var(--primary))" strokeWidth={2} />
              <Line type="monotone" dataKey="lint" name="Lint" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="smells" name="Smells" stroke="hsl(38 92% 50%)" />
              <Line type="monotone" dataKey="vulns" name="Vulns" stroke="hsl(0 84% 60%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
