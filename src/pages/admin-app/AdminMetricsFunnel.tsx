import { useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMetricsFunnel } from "@/hooks/admin/useMetrics";
import { FORMULAS, MetricFormula } from "@/components/admin-app/MetricFormula";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "60", label: "Últimos 60 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
  { value: "365", label: "Últimos 12 meses" },
];

const PLAN_OPTIONS = [
  { value: "all", label: "Todos os planos" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
];

function FunnelStep({
  label,
  value,
  total,
  rate,
  rateLabel,
}: {
  label: string;
  value: number;
  total: number;
  rate?: number;
  rateLabel?: string;
}) {
  const widthPct = total > 0 ? Math.max(8, (value / total) * 100) : 8;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          {value.toLocaleString("pt-BR")}
          {rate !== undefined && (
            <span className="ml-2 text-xs text-muted-foreground">
              {rateLabel}: {(rate * 100).toFixed(1)}%
            </span>
          )}
        </span>
      </div>
      <div className="h-10 bg-muted/40 rounded">
        <div
          className={cn(
            "h-full rounded bg-gradient-to-r from-primary to-primary/70 transition-all",
          )}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

export default function AdminMetricsFunnel() {
  const [periodDays, setPeriodDays] = useState("90");
  const [plan, setPlan] = useState("all");

  const { from, to } = useMemo(() => {
    const t = new Date();
    const f = new Date(t.getTime() - parseInt(periodDays) * 86400000);
    return { from: f, to: t };
  }, [periodDays]);

  const { data, isLoading } = useMetricsFunnel(from, to, plan === "all" ? null : plan);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Funil de conversão
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signup → Trial → Paid → Retained, por período e plano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-[200px]">
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Funil agregado <MetricFormula formula={FORMULAS.funnel} />
          </CardTitle>
          <CardDescription>
            {from.toLocaleDateString("pt-BR")} → {to.toLocaleDateString("pt-BR")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !data ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <>
              <FunnelStep label="Signups (workspaces)" value={data.signups} total={data.signups || 1} />
              <FunnelStep
                label="Trials iniciados"
                value={data.trials}
                total={data.signups || 1}
                rate={data.signup_to_trial_rate}
                rateLabel="signup→trial"
              />
              <FunnelStep
                label="Paid (active)"
                value={data.paid}
                total={data.signups || 1}
                rate={data.trial_to_paid_rate}
                rateLabel="trial→paid"
              />
              <FunnelStep
                label="Retidos"
                value={data.retained}
                total={data.signups || 1}
                rate={data.paid_retention_rate}
                rateLabel="retenção paid"
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quebra por plano</CardTitle>
          <CardDescription>Conversões observadas para cada plano no período.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : data.per_plan.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem dados para o filtro.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2">Plano</th>
                  <th className="py-2 text-right">Trials</th>
                  <th className="py-2 text-right">Paid</th>
                  <th className="py-2 text-right">Retidos</th>
                  <th className="py-2 text-right">Trial→Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.per_plan.map((row, i) => {
                  const conv = row.trials > 0 ? row.paid / row.trials : 0;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{row.plan_name ?? row.plan_code ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums">{row.trials}</td>
                      <td className="py-2 text-right tabular-nums">{row.paid}</td>
                      <td className="py-2 text-right tabular-nums">{row.retained}</td>
                      <td className="py-2 text-right tabular-nums">{(conv * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
