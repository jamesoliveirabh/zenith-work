import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  GitBranch,
  LineChart as LineChartIcon,
  Users2,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMetricsSummary, useMetricsTimeseries } from "@/hooks/admin/useMetrics";
import { formatMoney } from "@/lib/billing/format";
import { FORMULAS, MetricFormula } from "@/components/admin-app/MetricFormula";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
];

function pctChange(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !isFinite(value)) {
    return <span className="text-xs text-muted-foreground">vs. período anterior</span>;
  }
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "text-xs flex items-center gap-1",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}% vs. anterior
    </span>
  );
}

export default function AdminMetricsHome() {
  const [periodDays, setPeriodDays] = useState("30");

  const { from, to } = useMemo(() => {
    const t = new Date();
    const f = new Date(t.getTime() - parseInt(periodDays) * 86400000);
    return { from: f, to: t };
  }, [periodDays]);

  const { data: summary, isLoading: loadingSummary } = useMetricsSummary(from, to);
  const { data: series, isLoading: loadingSeries } = useMetricsTimeseries(12);

  const chartData = (series ?? []).map((p) => ({
    month: p.month,
    MRR: p.mrr_cents / 100,
    Receita: p.revenue_cents / 100,
    Novos: p.new_subs,
    Churn: p.churned,
  }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LineChartIcon className="h-6 w-6 text-primary" />
            Métricas executivas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visibilidade da operação SaaS — KPIs, séries temporais, coortes e funil.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <Link to="/metrics/cohorts">
              <Users2 className="h-4 w-4 mr-1.5" />
              Coortes
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/metrics/funnel">
              <GitBranch className="h-4 w-4 mr-1.5" />
              Funil
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              MRR <MetricFormula formula={FORMULAS.mrr} />
            </CardDescription>
            <CardTitle className="text-2xl">
              {loadingSummary ? "…" : formatMoney(summary?.mrr_cents ?? 0, "BRL")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Delta value={pctChange(summary?.mrr_cents ?? 0, summary?.previous_mrr_cents ?? 0)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              ARR <MetricFormula formula={FORMULAS.arr} />
            </CardDescription>
            <CardTitle className="text-2xl">
              {loadingSummary ? "…" : formatMoney(summary?.arr_cents ?? 0, "BRL")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {summary?.active_subscriptions ?? 0} assinaturas ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              Churn (período) <MetricFormula formula={FORMULAS.churn} />
            </CardDescription>
            <CardTitle className="text-2xl">
              {loadingSummary ? "…" : `${((summary?.churn_rate ?? 0) * 100).toFixed(2)}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {summary?.churned_count ?? 0} cancelamentos · {summary?.previous_churned_count ?? 0} no anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              Trial → Paid <MetricFormula formula={FORMULAS.trialConversion} />
            </CardDescription>
            <CardTitle className="text-2xl">
              {loadingSummary ? "…" : `${((summary?.trial_conversion_rate ?? 0) * 100).toFixed(1)}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {summary?.trial_converted ?? 0} de {summary?.trial_started ?? 0} trials
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              Recovery rate <MetricFormula formula={FORMULAS.recovery} />
            </CardDescription>
            <CardTitle className="text-2xl">
              {loadingSummary ? "…" : `${((summary?.recovery_rate ?? 0) * 100).toFixed(1)}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {summary?.dunning_recovered ?? 0} recuperados de {summary?.dunning_total ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receita cobrada (período)</CardDescription>
            <CardTitle className="text-2xl">
              {loadingSummary ? "…" : formatMoney(summary?.revenue_cents ?? 0, "BRL")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Delta
              value={pctChange(summary?.revenue_cents ?? 0, summary?.previous_revenue_cents ?? 0)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Time series */}
      <Card>
        <CardHeader>
          <CardTitle>MRR e Receita — últimos 12 meses</CardTitle>
          <CardDescription>
            MRR é snapshot do fim de cada mês; receita é soma de invoices pagas no mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {loadingSeries ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Carregando…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                    formatter={(v: number) => formatMoney(Math.round(v * 100), "BRL")}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="MRR" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="Receita" stroke="hsl(var(--chart-2, 200 80% 50%))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novos clientes vs. churn (mensal)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            {loadingSeries ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Carregando…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Novos" fill="hsl(var(--primary))" />
                  <Bar dataKey="Churn" fill="hsl(0 84% 60%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Definições de métricas</CardTitle>
          <CardDescription>Fórmulas usadas neste painel</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {Object.entries(FORMULAS).map(([k, v]) => (
            <div key={k} className="border-l-2 border-primary/40 pl-3">
              <div className="font-mono text-xs text-muted-foreground">{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
