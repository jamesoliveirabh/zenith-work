import { Link } from "react-router-dom";
import { CreditCard, FileText, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAdminBillingMetrics } from "@/hooks/useAdminBilling";
import { formatMoney } from "@/lib/billing/format";

export default function AdminFinanceHome() {
  const { data: metrics, isLoading } = useAdminBillingMetrics(30);

  const tiles = [
    {
      label: "Contas totais",
      value: metrics?.total_accounts ?? "—",
    },
    {
      label: "Em atraso (past due)",
      value: metrics?.past_due ?? "—",
    },
    {
      label: "Casos abertos de dunning",
      value: metrics?.open_dunning_cases ?? "—",
    },
    {
      label: "MRR estimado",
      value: metrics ? formatMoney(metrics.mrr_cents_estimate, "BRL") : "—",
    },
  ];

  const sections = [
    {
      to: "/finance/subscriptions",
      title: "Assinaturas",
      description: "Listar, alterar plano, cancelar ou reativar assinaturas.",
      icon: CreditCard,
    },
    {
      to: "/finance/invoices",
      title: "Faturas",
      description: "Gerar faturas mock, marcar como paga, void ou uncollectible.",
      icon: FileText,
    },
    {
      to: "/finance/dunning",
      title: "Inadimplência",
      description: "Forçar retries, estender período de carência e encerrar casos.",
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Operação financeira global da plataforma — assinaturas, faturas e inadimplência.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className="text-2xl font-semibold mt-1">
                {isLoading ? "—" : String(t.value)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Card key={s.to} className="hover:bg-accent/40 transition-colors">
            <CardHeader>
              <div className="flex items-center gap-2">
                <s.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{s.title}</CardTitle>
              </div>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to={s.to}>
                  Abrir <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
