// Phase H6 — Dunning scheduler entrypoints.
// These are idempotent, manually-invocable functions that can later be wired
// to a cron job (pg_cron + pg_net or external scheduler).
//
// TODO(billing-cron): wire to pg_cron once homologation graduates to production.
// Example schedule: every 15 minutes -> processDueDunningRetries; every hour ->
// processExpiredGracePeriods.

import { dunningProcessDue, dunningProcessExpired } from './dunningService';

export async function processDueDunningRetries(opts?: { forceResult?: 'paid' | 'failed' }) {
  return dunningProcessDue({ forceResult: opts?.forceResult });
}

export async function processExpiredGracePeriods() {
  return dunningProcessExpired();
}

/**
 * Reconcile inconsistent dunning state for a workspace (or globally).
 * In the mock implementation we just chain the two main jobs; a future
 * implementation should also detect orphaned past_due subscriptions and
 * synchronize entitlements.
 */
export async function reconcileDunningState() {
  const due = await processDueDunningRetries();
  const expired = await processExpiredGracePeriods();
  return { due, expired };
}
