/**
 * Phase H5 — React hook around the enforcement adapter.
 *
 * Uso típico:
 *   const enforce = useEntitlementEnforcement(workspaceId);
 *   const r = await enforce.check('members', 1, 'invite_member');
 *   if (!r.allowed) { setBlock(r); return; }
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  checkEntitlement,
  decrementUsage,
  type EntitlementCheckResult,
} from '@/lib/billing/enforcement';

export function useEntitlementEnforcement(workspaceId?: string | null) {
  const qc = useQueryClient();
  const [lastResult, setLastResult] = useState<EntitlementCheckResult | null>(null);
  const [blocked, setBlocked] = useState<EntitlementCheckResult | null>(null);

  const invalidateCaches = useCallback(() => {
    if (!workspaceId) return;
    qc.invalidateQueries({ queryKey: ['billing', 'entitlements', workspaceId] });
    qc.invalidateQueries({ queryKey: ['billing', 'usage-metrics', workspaceId] });
  }, [qc, workspaceId]);

  const check = useCallback(
    async (
      featureKey: string,
      incrementBy = 1,
      action = 'check',
      opts: { commitUsage?: boolean; context?: Record<string, unknown> } = {},
    ): Promise<EntitlementCheckResult> => {
      if (!workspaceId) {
        return {
          allowed: true,
          mode: 'warn_only',
          decision: 'allowed',
          featureKey,
          currentUsage: 0,
          limitValue: null,
          projectedUsage: 0,
          reasonCode: null,
          overrideActive: false,
          upgradeSuggested: false,
          message: '',
        };
      }
      const r = await checkEntitlement({
        workspaceId,
        featureKey,
        incrementBy,
        action,
        commitUsage: opts.commitUsage ?? false,
        context: opts.context ?? {},
      });
      setLastResult(r);
      if (!r.allowed) setBlocked(r);
      if (opts.commitUsage && r.allowed) invalidateCaches();
      return r;
    },
    [workspaceId, invalidateCaches],
  );

  const decrement = useCallback(
    async (featureKey: string, by = 1) => {
      if (!workspaceId) return;
      await decrementUsage(workspaceId, featureKey, by);
      invalidateCaches();
    },
    [workspaceId, invalidateCaches],
  );

  const dismissBlock = useCallback(() => setBlocked(null), []);

  return { check, decrement, lastResult, blocked, dismissBlock };
}
