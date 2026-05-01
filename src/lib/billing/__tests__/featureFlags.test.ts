/**
 * Phase H9 — Feature flags unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearBillingFeatureFlagOverrides,
  getBillingFeatureFlags,
  isBillingKillSwitchEngaged,
  setBillingFeatureFlagOverride,
} from '../featureFlags';

describe('billing feature flags', () => {
  beforeEach(() => clearBillingFeatureFlagOverrides());

  it('returns safe defaults', () => {
    const f = getBillingFeatureFlags();
    expect(f.provider).toBe('mock');
    expect(f.enforcementMode).toBe('warn_only');
    expect(f.adminActionsEnabled).toBe(true);
    expect(f.dunningEnabled).toBe(true);
    expect(f.killSwitch).toBe(false);
  });

  it('localStorage override takes precedence', () => {
    setBillingFeatureFlagOverride({ enforcementMode: 'hard_block', killSwitch: true });
    const f = getBillingFeatureFlags();
    expect(f.enforcementMode).toBe('hard_block');
    expect(isBillingKillSwitchEngaged()).toBe(true);
  });

  it('clear removes overrides', () => {
    setBillingFeatureFlagOverride({ killSwitch: true });
    clearBillingFeatureFlagOverrides();
    expect(getBillingFeatureFlags().killSwitch).toBe(false);
  });
});
