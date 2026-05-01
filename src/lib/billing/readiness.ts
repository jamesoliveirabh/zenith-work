/**
 * Phase H9 — Billing readiness probe.
 *
 * `readiness` differs from `health`: it answers "is the billing surface ready
 * to accept *new traffic*?" — i.e. all critical dependencies green AND no
 * kill-switch / maintenance flag engaged. Used as a gate before enabling
 * paid plans for a cohort during rollout.
 */

import { checkBillingHealth, type BillingHealthReport } from './health';
import { getBillingFeatureFlags } from './featureFlags';
import { logBillingEvent, newCorrelationId } from './observability';

export interface BillingReadinessReport {
  ready: boolean;
  reasons: string[];
  health: BillingHealthReport;
  flags: ReturnType<typeof getBillingFeatureFlags>;
  checked_at: string;
}

export async function checkBillingReadiness(): Promise<BillingReadinessReport> {
  const cid = newCorrelationId('ready');
  const health = await checkBillingHealth();
  const flags = getBillingFeatureFlags();
  const reasons: string[] = [];

  if (health.overall === 'down') reasons.push('health.overall=down');
  if (flags.killSwitch) reasons.push('billing.kill_switch.engaged');
  // For a real provider rollout we'd require the adapter to be live:
  if (flags.provider !== 'mock') {
    const providerComp = health.components.find((c) => c.name === `provider.${flags.provider}`);
    if (!providerComp || providerComp.status !== 'ok') {
      reasons.push(`provider.${flags.provider}.not_ready`);
    }
  }

  const ready = reasons.length === 0;
  logBillingEvent({
    level: ready ? 'info' : 'warn',
    domain: 'health',
    event: 'billing.readiness.checked',
    correlation_id: cid,
    context: { ready, reasons },
  });

  return {
    ready,
    reasons,
    health,
    flags,
    checked_at: new Date().toISOString(),
  };
}
