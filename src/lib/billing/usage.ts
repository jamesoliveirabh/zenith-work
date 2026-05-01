import type { UsageItem, UsageStatus } from '@/types/billing';

const WARNING_THRESHOLD = 0.8; // 80%
const CRITICAL_THRESHOLD = 1.0; // 100%

export function classifyUsage(currentUsage: number, limitValue: number | null): UsageStatus {
  if (limitValue === null || limitValue === undefined) return 'unlimited';
  if (limitValue <= 0) return 'critical';
  const ratio = currentUsage / limitValue;
  if (ratio >= CRITICAL_THRESHOLD) return 'critical';
  if (ratio >= WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

export function calculateUsagePct(currentUsage: number, limitValue: number | null): number | null {
  if (limitValue === null || limitValue === undefined) return null;
  if (limitValue <= 0) return 100;
  return Math.min(100, Math.max(0, (currentUsage / limitValue) * 100));
}

export interface FeatureMeta {
  label: string;
  unit?: string;
  order: number;
}

export const FEATURE_REGISTRY: Record<string, FeatureMeta> = {
  members: { label: 'Membros', order: 1 },
  automations: { label: 'Automações ativas', order: 2 },
  storage_gb: { label: 'Armazenamento', unit: 'GB', order: 3 },
  published_docs: { label: 'Documentos publicados', order: 4 },
  active_goals: { label: 'Metas ativas', order: 5 },
};

export function buildUsageItem(
  featureKey: string,
  currentUsage: number,
  limitValue: number | null,
): UsageItem {
  const meta = FEATURE_REGISTRY[featureKey] ?? { label: featureKey, order: 99 };
  return {
    featureKey,
    label: meta.label,
    unit: meta.unit,
    currentUsage,
    limitValue,
    usagePct: calculateUsagePct(currentUsage, limitValue),
    status: classifyUsage(currentUsage, limitValue),
  };
}

export function formatUsageValue(item: UsageItem): string {
  const cur = formatNumber(item.currentUsage);
  if (item.limitValue === null) {
    return item.unit ? `${cur} ${item.unit} / Ilimitado` : `${cur} / Ilimitado`;
  }
  const lim = formatNumber(item.limitValue);
  return item.unit ? `${cur} ${item.unit} / ${lim} ${item.unit}` : `${cur} / ${lim}`;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}
