import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { formatMoney, planIntervalLabel } from '@/lib/billing/format';
import type { Plan } from '@/types/billing';
import { cn } from '@/lib/utils';

interface Props {
  plan: Plan;
  currentPlan?: Plan | null;
  disabled?: boolean;
  loading?: boolean;
  onSelect: () => void;
}

const FEATURE_LABELS: Record<string, (v: number | undefined) => string> = {
  members: (v) => (v == null ? 'Membros ilimitados' : `${v} membros`),
  spaces: (v) => (v == null ? 'Spaces ilimitados' : `${v} spaces`),
  automations: (v) => (v == null ? 'Automações ilimitadas' : `${v} automações`),
  storage_gb: (v) => (v == null ? 'Storage ilimitado' : `${v} GB de storage`),
  api_access: (v) => (v ? 'Acesso à API' : 'Sem acesso à API'),
  sso: (v) => (v ? 'SSO incluído' : 'Sem SSO'),
  audit_logs: (v) => (v ? 'Logs de auditoria' : 'Sem logs de auditoria'),
};

function describeLimit(key: string, value: number | undefined) {
  const fn = FEATURE_LABELS[key];
  if (fn) return fn(value);
  if (value == null) return `${key}: ilimitado`;
  return `${key}: ${value}`;
}

export function PlanCard({ plan, currentPlan, disabled, loading, onSelect }: Props) {
  const isCurrent = currentPlan?.id === plan.id;
  const isUpgrade =
    !!currentPlan && plan.price_cents > currentPlan.price_cents;
  const isDowngrade =
    !!currentPlan && plan.price_cents < currentPlan.price_cents;

  const ctaLabel = isCurrent
    ? 'Plano atual'
    : !currentPlan
      ? 'Assinar'
      : isUpgrade
        ? 'Fazer upgrade'
        : isDowngrade
          ? 'Fazer downgrade'
          : 'Selecionar';

  const limits = Object.entries(plan.limits_json ?? {});

  return (
    <Card
      className={cn(
        'flex flex-col',
        isCurrent && 'border-primary shadow-sm ring-1 ring-primary/30',
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          {isCurrent && (
            <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">
              Ativo
            </span>
          )}
        </div>
        {plan.description && (
          <p className="text-xs text-muted-foreground">{plan.description}</p>
        )}
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-semibold">
            {formatMoney(plan.price_cents, plan.currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            {planIntervalLabel(plan.interval)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <ul className="space-y-2 text-sm flex-1">
          {limits.length === 0 && (
            <li className="text-muted-foreground">Plano sem limites configurados.</li>
          )}
          {limits.map(([k, v]) => (
            <li key={k} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{describeLimit(k, v as number | undefined)}</span>
            </li>
          ))}
        </ul>
        <Button
          variant={isCurrent ? 'outline' : isUpgrade || !currentPlan ? 'default' : 'secondary'}
          disabled={disabled || isCurrent || loading}
          onClick={onSelect}
          className="w-full"
        >
          {loading ? 'Processando…' : ctaLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
