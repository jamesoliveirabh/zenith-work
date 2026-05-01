import { toast } from 'sonner';
import type { EntitlementCheckResult } from '@/lib/billing/enforcement';
import { FEATURE_REGISTRY } from '@/lib/billing/usage';

/**
 * Helper para disparar um toast de aviso a partir de um resultado de enforcement.
 * Use após `check()` quando `decision === 'warned'`.
 */
export function showEntitlementWarningToast(
  result: EntitlementCheckResult,
  opts: { onUpgrade?: () => void } = {},
) {
  const label = FEATURE_REGISTRY[result.featureKey]?.label ?? result.featureKey;
  const usageStr =
    result.limitValue === null
      ? `${result.currentUsage}`
      : `${result.currentUsage}/${result.limitValue}`;

  toast.warning(`Limite de ${label} próximo do teto`, {
    description: `Uso atual: ${usageStr}. Considere fazer upgrade.`,
    action: opts.onUpgrade
      ? { label: 'Upgrade', onClick: opts.onUpgrade }
      : undefined,
  });
}
