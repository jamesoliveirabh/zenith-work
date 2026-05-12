import { useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import { BurndownChart } from "@/components/reports/BurndownChart";
import { VelocityChart } from "@/components/reports/VelocityChart";
import { TaskMetricsCard } from "@/components/reports/TaskMetricsCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Range = "week" | "month" | "quarter";
const DAYS: Record<Range, number> = { week: 7, month: 30, quarter: 90 };
const WEEKS: Record<Range, number> = { week: 2, month: 4, quarter: 12 };

export default function ReportsView() {
  const { listId } = useParams<{ listId: string }>();
  const [range, setRange] = useState<Range>("month");

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Relatórios &amp; análises
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhamento detalhado deste projeto.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("Export disponível em breve")}
        >
          <Download className="h-4 w-4 mr-1.5" />
          Exportar
        </Button>
      </header>

      <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
        <TabsList>
          <TabsTrigger value="week">Última semana</TabsTrigger>
          <TabsTrigger value="month">Último mês</TabsTrigger>
          <TabsTrigger value="quarter">Último trimestre</TabsTrigger>
        </TabsList>
      </Tabs>

      <TaskMetricsCard listId={listId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <BurndownChart listId={listId} days={DAYS[range]} />
        <VelocityChart listId={listId} weeks={WEEKS[range]} />
      </div>
    </div>
  );
}
