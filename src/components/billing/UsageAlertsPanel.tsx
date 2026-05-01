import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { UpgradeCtaInline } from './UpgradeCtaInline';
import type { UsageItem } from '@/types/billing';
import { formatUsageValue } from '@/lib/billing/usage';

interface Props {
  items: UsageItem[];
  onUpgrade: () => void;
  canMutate?: boolean;
}

export function UsageAlertsPanel({ items, onUpgrade, canMutate = true }: Props) {
  const criticals = items.filter((i) => i.status === 'critical');
  const warnings = items.filter((i) => i.status === 'warning');

  if (criticals.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {criticals.map((i) => (
        <Row key={i.featureKey} item={i} severity="critical" />
      ))}
      {warnings.map((i) => (
        <Row key={i.featureKey} item={i} severity="warning" />
      ))}
      <UpgradeCtaInline
        variant="block"
        onUpgrade={onUpgrade}
        disabled={!canMutate}
        message={
          criticals.length > 0
            ? 'Você atingiu o limite de algum recurso. Faça upgrade para continuar com folga.'
            : 'Você está próximo do limite de algum recurso.'
        }
      />
    </div>
  );
}

function Row({ item, severity }: { item: UsageItem; severity: 'warning' | 'critical' }) {
  const Icon = severity === 'critical' ? AlertOctagon : AlertTriangle;
  const cls =
    severity === 'critical'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100';

  const headline =
    severity === 'critical'
      ? `Limite de ${item.label.toLowerCase()} atingido`
      : `Você está próximo do limite de ${item.label.toLowerCase()}`;

  return (
    <div className={`flex items-start gap-2 p-3 rounded-md border text-sm ${cls}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">{headline}</div>
        <div className="text-xs opacity-80 mt-0.5">Uso atual: {formatUsageValue(item)}</div>
      </div>
    </div>
  );
}
