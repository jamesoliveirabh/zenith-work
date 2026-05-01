/**
 * Phase H5 — frontend feature flags & defaults for billing enforcement.
 *
 * Server-side é a fonte de verdade (RPC `billing_check_entitlement`),
 * mas mantemos flags locais para:
 *  - kill switch rápido em emergência (sem migration)
 *  - desligar UI de bloqueio em ambientes específicos
 *  - debug
 *
 * Persistência em localStorage por chave `billing.enforcement.flags`.
 */

export type EnforcementMode = 'warn_only' | 'soft_block' | 'hard_block';

export interface EnforcementFlags {
  enabled: boolean;
  killSwitch: boolean;
  /** Forçar um modo client-side (apenas para UX; servidor decide allow). */
  forcedMode?: EnforcementMode | null;
  /** Mostrar diálogo/modal mesmo em warn_only (debug). */
  alwaysShowDialog?: boolean;
}

const STORAGE_KEY = 'billing.enforcement.flags';

const DEFAULT_FLAGS: EnforcementFlags = {
  enabled: true,
  killSwitch: false,
  forcedMode: null,
  alwaysShowDialog: false,
};

export function getEnforcementFlags(): EnforcementFlags {
  if (typeof window === 'undefined') return DEFAULT_FLAGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FLAGS;
    return { ...DEFAULT_FLAGS, ...(JSON.parse(raw) as Partial<EnforcementFlags>) };
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function setEnforcementFlags(patch: Partial<EnforcementFlags>): EnforcementFlags {
  const next = { ...getEnforcementFlags(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

export function isEnforcementClientEnabled(): boolean {
  const f = getEnforcementFlags();
  return f.enabled && !f.killSwitch;
}
