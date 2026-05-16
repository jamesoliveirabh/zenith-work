import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSprintReport, useRetrospective, useRetrospectiveItems } from "@/hooks/useSprintAnalytics";
import type { Sprint } from "@/hooks/useSprints";

interface Props { sprint: Sprint }

export function SprintReportView({ sprint }: Props) {
  const { data: report } = useSprintReport(sprint.id);
  const { data: retro } = useRetrospective(sprint.id);
  const { data: items = [] } = useRetrospectiveItems(retro?.id);

  const keepTop = items.filter((i) => i.category === "keep").slice(0, 5);
  const stopTop = items.filter((i) => i.category === "stop").slice(0, 5);
  const actions = items.filter((i) => i.is_action_item);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ sprint, report, retro, items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprint-${sprint.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Relatório da Sprint</CardTitle>
          <CardDescription>O relatório é gerado automaticamente quando a sprint é concluída.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Sprint Report — {sprint.name}</CardTitle>
              <CardDescription>
                {format(parseISO(sprint.start_date), "dd MMM", { locale: ptBR })} —{" "}
                {format(parseISO(sprint.end_date), "dd MMM yyyy", { locale: ptBR })}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={exportJson}>
              <Download className="h-4 w-4 mr-1" /> Exportar JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Planejado" value={`${report.planned_velocity ?? 0}pt`} />
          <Metric label="Entregue" value={`${report.actual_velocity ?? 0}pt`} />
          <Metric label="Conclusão" value={`${report.completion_percentage ?? 0}%`} />
          <Metric label="Tarefa mais longa" value={`${report.longest_task_days ?? 0}d`} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">✅ O que deu certo</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {keepTop.length === 0 && <p className="text-muted-foreground">Sem itens.</p>}
            {keepTop.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-2">
                <span>{i.content}</span>
                <Badge variant="secondary" className="shrink-0">{i.votes} votos</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">🛑 O que evitar</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {stopTop.length === 0 && <p className="text-muted-foreground">Sem itens.</p>}
            {stopTop.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-2">
                <span>{i.content}</span>
                <Badge variant="secondary" className="shrink-0">{i.votes} votos</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">📌 Ações para próxima sprint</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {actions.length === 0 && <p className="text-muted-foreground">Nenhuma ação registrada.</p>}
          {actions.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-2 border-b last:border-0 py-2">
              <span>{i.content}</span>
              {i.due_date && <Badge variant="outline" className="shrink-0">📅 {i.due_date}</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
