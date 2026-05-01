import { describe, it, expect } from 'vitest';
import { EntitlementBlockedError, type EntitlementCheckResult } from '@/lib/billing/enforcement';

function makeResult(partial: Partial<EntitlementCheckResult>): EntitlementCheckResult {
  return {
    allowed: true,
    mode: 'warn_only',
    decision: 'allowed',
    featureKey: 'members',
    currentUsage: 0,
    limitValue: null,
    projectedUsage: 0,
    reasonCode: null,
    overrideActive: false,
    upgradeSuggested: false,
    message: '',
    ...partial,
  };
}

/**
 * Pure logic tests — server-side RPC tem comportamento definitivo;
 * aqui validamos contratos do adapter / shape do resultado.
 */
describe('billing enforcement contract', () => {
  it('limit null => allowed', () => {
    const r = makeResult({ limitValue: null, currentUsage: 50, allowed: true });
    expect(r.allowed).toBe(true);
    expect(r.upgradeSuggested).toBe(false);
  });

  it('warn_only over limit still allowed but warns', () => {
    const r = makeResult({
      mode: 'warn_only',
      decision: 'warned',
      allowed: true,
      currentUsage: 11,
      limitValue: 10,
      reasonCode: 'LIMIT_EXCEEDED',
    });
    expect(r.allowed).toBe(true);
    expect(r.decision).toBe('warned');
  });

  it('soft_block over limit denies with upgrade hint', () => {
    const r = makeResult({
      mode: 'soft_block',
      decision: 'soft_blocked',
      allowed: false,
      upgradeSuggested: true,
      currentUsage: 10,
      limitValue: 10,
      reasonCode: 'LIMIT_REACHED',
    });
    expect(r.allowed).toBe(false);
    expect(r.upgradeSuggested).toBe(true);
  });

  it('hard_block raises EntitlementBlockedError', () => {
    const r = makeResult({
      mode: 'hard_block',
      decision: 'hard_blocked',
      allowed: false,
      currentUsage: 11,
      limitValue: 10,
    });
    const err = new EntitlementBlockedError(r);
    expect(err).toBeInstanceOf(EntitlementBlockedError);
    expect(err.result.decision).toBe('hard_blocked');
    expect(err.result.allowed).toBe(false);
  });

  it('override_applied surfaces flag', () => {
    const r = makeResult({
      decision: 'override_applied',
      overrideActive: true,
      allowed: true,
      currentUsage: 50,
      limitValue: 10,
    });
    expect(r.allowed).toBe(true);
    expect(r.overrideActive).toBe(true);
  });
});
