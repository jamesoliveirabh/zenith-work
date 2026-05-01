import { useState } from "react";
import { Users2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMetricsCohorts } from "@/hooks/admin/useMetrics";
import { FORMULAS, MetricFormula } from "@/components/admin-app/MetricFormula";
import { cn } from "@/lib/utils";

function rateColor(rate: number): string {
  if (rate >= 0.8) return "bg-emerald-500/80 text-white";
  if (rate >= 0.6) return "bg-emerald-400/70 text-white";
  if (rate >= 0.4) return "bg-amber-400/70 text-foreground";
  if (rate >= 0.2) return "bg-amber-500/70 text-white";
  if (rate > 0) return "bg-rose-400/70 text-white";
  return "bg-muted text-muted-foreground";
}

export default function AdminMetricsCohorts() {
  const [months, setMonths] = useState("12");
  const [view, setView] = useState<"logo" | "revenue">("logo");
  const { data: cohorts, isLoading } = useMetricsCohorts(parseInt(months));

  const maxOffsets = Math.max(0, ...((cohorts ?? []).map((c) => c.periods?.length ?? 0)));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            Coortes de retenção
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada linha é um coorte mensal (mês de signup). Cada célula mostra a retenção N meses depois.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "logo" | "revenue")}
            size="sm"
          >
            <ToggleGroupItem value="logo">Logo</ToggleGroupItem>
            <ToggleGroupItem value="revenue">Receita</ToggleGroupItem>
          </ToggleGroup>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
              <SelectItem value="24">24 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {view === "logo" ? "Retenção por logo" : "Retenção de receita (MRR)"}
            <MetricFormula formula={view === "logo" ? FORMULAS.retention : FORMULAS.mrrRetention} />
          </CardTitle>
          <CardDescription>
            Verde = retenção alta · Âmbar = média · Vermelho = baixa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Carregando…</div>
          ) : !cohorts || cohorts.length === 0 ? (
            <div className="text-muted-foreground text-sm">Sem dados de coortes no período.</div>
          ) : (
            <div className="overflow-auto">
              <table className="text-xs border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 font-medium text-muted-foreground">Coorte</th>
                    <th className="text-right px-2 py-1 font-medium text-muted-foreground">Tamanho</th>
                    {Array.from({ length: maxOffsets }).map((_, i) => (
                      <th
                        key={i}
                        className="text-center px-2 py-1 font-medium text-muted-foreground"
                      >
                        M{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.cohort_month}>
                      <td className="px-2 py-1 font-mono">{c.cohort_month}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                        {c.size}
                      </td>
                      {Array.from({ length: maxOffsets }).map((_, i) => {
                        const p = c.periods?.find((x) => x.offset === i);
                        if (!p) return <td key={i} />;
                        const rate = view === "logo" ? p.retention_rate : p.mrr_retention_rate;
                        return (
                          <td key={i} className="px-0 py-0">
                            <div
                              className={cn(
                                "rounded px-2 py-1.5 text-center min-w-[56px] tabular-nums",
                                rateColor(rate),
                              )}
                              title={
                                view === "logo"
                                  ? `${p.retained}/${c.size} (${(rate * 100).toFixed(1)}%)`
                                  : `${(rate * 100).toFixed(1)}% MRR retido`
                              }
                            >
                              {(rate * 100).toFixed(0)}%
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
