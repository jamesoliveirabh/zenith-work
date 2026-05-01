/**
 * Phase H9 — Billing rollout feature flags.
 *
 * Centralizes the rollout switches called out in the readiness plan:
 *
 *   BILLING_PROVIDER             mock | stripe | pagarme
 *   BILLING_ENFORCEMENT_MODE     warn_only | soft_block | hard_block
 *   BILLING_ADMIN_ACTIONS_ENABLED
 *   BILLING_DUNNING_ENABLED
 *
 * Sources, in priority order:
 *   1. Vite env (`import.meta.env.VITE_*`)
 *   2. localStorage override (developer / kill-switch)
 *   3. Compiled defaults (safe-by-default for production)
 *
 * Server is still the authority (RPCs gate real mutations). These flags
 * shape *frontend* behavior + give us a single audit point.
 */

export type BillingProviderFlag = 'mock' | 'stripe' | 'pagarme';
export type EnforcementModeFlag = 'warn_only' | 'soft_block' | 'hard_block';

export interface BillingFeatureFlags {
  provider: BillingProviderFlag;
  enforcementMode: EnforcementModeFlag;
  adminActionsEnabled: boolean;
  dunningEnabled: boolean;
  /** Master kill-switch — disables non-essential billing UI/automations. */
  killSwitch: boolean;
}

const DEFAULTS: BillingFeatureFlags = {
  provider: 'mock',
  enforcementMode: 'warn_only',
  adminActionsEnabled: true,
  dunningEnabled: true,
  killSwitch: false,
};

const STORAGE_KEY = 'billing.feature.flags';

function readEnv(): Partial<BillingFeatureFlags> {
  const env = (typeof import.meta !== 'undefined' ? import.meta.env : {}) as Record<string, string | undefined>;
  const out: Partial<BillingFeatureFlags> = {};
  if (env.VITE_BILLING_PROVIDER) out.provider = env.VITE_BILLING_PROVIDER as BillingProviderFlag;
  if (env.VITE_BILLING_ENFORCEMENT_MODE) {
    out.enforcementMode = env.VITE_BILLING_ENFORCEMENT_MODE as EnforcementModeFlag;
  }
  if (env.VITE_BILLING_ADMIN_ACTIONS_ENABLED) {
    out.adminActionsEnabled = env.VITE_BILLING_ADMIN_ACTIONS_ENABLED === 'true';
  }
  if (env.VITE_BILLING_DUNNING_ENABLED) {
    out.dunningEnabled = env.VITE_BILLING_DUNNING_ENABLED === 'true';
  }
  if (env.VITE_BILLING_KILL_SWITCH) {
    out.killSwitch = env.VITE_BILLING_KILL_SWITCH === 'true';
  }
  return out;
}

function readLocal(): Partial<BillingFeatureFlags> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<BillingFeatureFlags>;
  } catch {
    return {};
  }
}

export function getBillingFeatureFlags(): BillingFeatureFlags {
  return { ...DEFAULTS, ...readEnv(), ...readLocal() };
}

export function setBillingFeatureFlagOverride(patch: Partial<BillingFeatureFlags>): BillingFeatureFlags {
  const next = { ...readLocal(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return getBillingFeatureFlags();
}

export function clearBillingFeatureFlagOverrides() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function isBillingKillSwitchEngaged(): boolean {
  return getBillingFeatureFlags().killSwitch;
}
