/**
 * Phase H9 — Billing health check.
 *
 * Lightweight readiness probe used by the admin "degraded mode" badge and by
 * a future `/health` endpoint. Performs cheap, read-only checks against the
 * critical billing dependencies.
 */

import { supabase } from '@/integrations/supabase/client';
import { getBillingFeatureFlags } from './featureFlags';
import { logBillingEvent, newCorrelationId } from './observability';

export type ComponentStatus = 'ok' | 'degraded' | 'down' | 'disabled';

export interface BillingHealthComponent {
  name: string;
  status: ComponentStatus;
  latency_ms?: number;
  detail?: string;
}

export interface BillingHealthReport {
  overall: ComponentStatus;
  checked_at: string;
  components: BillingHealthComponent[];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - start };
  } catch (error) {
    return { error, ms: Date.now() - start };
  }
}

function rollup(parts: ComponentStatus[]): ComponentStatus {
  if (parts.some((p) => p === 'down')) return 'down';
  if (parts.some((p) => p === 'degraded')) return 'degraded';
  return 'ok';
}

export async function checkBillingHealth(): Promise<BillingHealthReport> {
  const cid = newCorrelationId('health');
  const flags = getBillingFeatureFlags();
  const components: BillingHealthComponent[] = [];

  // 1. Plans table reachable
  const plans = await timed(async () => {
    const { error, count } = await supabase
      .from('billing_plans')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  });
  components.push({
    name: 'db.billing_plans',
    status: plans.error ? 'down' : 'ok',
    latency_ms: plans.ms,
    detail: plans.error ? String((plans.error as Error)?.message ?? plans.error) : undefined,
  });

  // 2. Provider adapter reachability (mock = function ping; real = TODO)
  if (flags.provider === 'mock') {
    const ping = await timed(async () => {
      const { error } = await supabase.functions.invoke('billing-mock', {
        body: { action: 'health.ping' },
      });
      // The mock function may not implement health.ping — treat unknown action as OK
      // because the function itself responded.
      if (error && !/non-2xx|404|action/i.test(error.message ?? '')) throw error;
      return true;
    });
    components.push({
      name: 'provider.mock',
      status: ping.error ? 'degraded' : 'ok',
      latency_ms: ping.ms,
      detail: ping.error ? String((ping.error as Error)?.message ?? ping.error) : 'mock provider',
    });
  } else {
    components.push({
      name: `provider.${flags.provider}`,
      status: 'disabled',
      detail: 'Real provider not yet wired (TODO H10).',
    });
  }

  // 3. Dunning subsystem flag
  components.push({
    name: 'dunning.subsystem',
    status: flags.dunningEnabled ? 'ok' : 'disabled',
  });

  // 4. Admin actions flag
  components.push({
    name: 'admin.actions',
    status: flags.adminActionsEnabled ? 'ok' : 'disabled',
  });

  // 5. Kill switch
  components.push({
    name: 'billing.kill_switch',
    status: flags.killSwitch ? 'down' : 'ok',
    detail: flags.killSwitch ? 'Engaged — billing in safe mode' : undefined,
  });

  const overall = rollup(components.filter((c) => c.status !== 'disabled').map((c) => c.status));

  const report: BillingHealthReport = {
    overall,
    checked_at: new Date().toISOString(),
    components,
  };

  logBillingEvent({
    level: overall === 'ok' ? 'info' : 'warn',
    domain: 'health',
    event: 'billing.health.checked',
    correlation_id: cid,
    context: { overall, components: components.map((c) => ({ name: c.name, status: c.status })) },
  });

  return report;
}
