import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MetricFormula({ formula, children }: { formula: string; children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline-block" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs font-mono">{formula}</p>
          {children && <p className="text-xs mt-1 text-muted-foreground">{children}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const FORMULAS = {
  mrr: "MRR = Σ(preço mensal das assinaturas active+past_due). Planos anuais são divididos por 12.",
  arr: "ARR = MRR × 12.",
  churn: "Churn = assinaturas canceladas no período / assinaturas pagantes no início do período.",
  recovery: "Recovery rate = casos de dunning recuperados / total de casos abertos no período.",
  trialConversion: "Trial→Paid = trials criados no período que viraram active com period_start definido / total de trials criados no período.",
  retention: "Retenção logo (mês N) = clientes do coorte ainda ativos no fim do mês N / tamanho inicial do coorte.",
  mrrRetention: "Retenção de receita (mês N) = MRR do coorte ainda ativo no mês N / MRR inicial do coorte.",
  funnel: "Funil: Signup → Trial (assinatura com trial_ends_at) → Paid (active+period_start) → Retained (active sem cancelamento recente).",
};
