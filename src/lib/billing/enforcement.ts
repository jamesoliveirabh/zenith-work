/**
 * Phase H5 — Central client adapter for billing enforcement.
 *
 * Server-side é a fonte de verdade. Este módulo:
 *  - chama a RPC `billing_check_entitlement`
 *  - normaliza o payload para a UI
 *  - oferece helpers `assertEntitlement` (lança) e `checkEntitlement` (não lança)
 *  - oferece `commitUsage` / `decrementUsage` para contabilidade
 */

import { supabase } from '@/integrations/supabase/client';
import { isEnforcementClientEnabled, getEnforcementFlags } from './enforcementConfig';
import type { EnforcementMode } from './enforcementConfig';

export type EntitlementDecision =
  | 'allowed'
  | 'warned'
  | 'soft_blocked'
  | 'hard_blocked'
  | 'override_applied';

export type EntitlementReasonCode =
  | 'LIMIT_REACHED'
  | 'LIMIT_EXCEEDED'
  | 'PLAN_REQUIRED'
  | null;

export interface EntitlementCheckResult {
  allowed: boolean;
  mode: EnforcementMode;
  decision: EntitlementDecision;
  featureKey: string;
  currentUsage: number;
  limitValue: number | null;
  projectedUsage: number;
  reasonCode: EntitlementReasonCode;
  overrideActive: boolean;
  message?: string;
  upgradeSuggested: boolean;
}

export interface EntitlementCheckArgs {
  workspaceId: string;
  featureKey: string;
  incrementBy?: number;
  action?: string;
  context?: Record<string, unknown>;
  /** Se true, o servidor incrementa current_usage quando permitido. */
  commitUsage?: boolean;
}

const DEFAULT_MESSAGES: Record<EntitlementDecision, string> = {
  allowed: '',
  override_applied: 'Ação permitida via exceção administrativa.',
  warned: 'Você está próximo (ou acima) do limite do seu plano.',
  soft_blocked:
    'Você atingiu o limite do seu plano para este recurso. Faça upgrade para continuar.',
  hard_blocked:
    'Esta ação foi bloqueada porque excede o limite do seu plano. Faça upgrade para liberar.',
};

export async function checkEntitlement(
  args: EntitlementCheckArgs,
): Promise<EntitlementCheckResult> {
  const {
    workspaceId,
    featureKey,
    incrementBy = 1,
    action = 'check',
    context = {},
    commitUsage = false,
  } = args;

  // Client kill switch -> sempre permite (sem chamar servidor)
  if (!isEnforcementClientEnabled()) {
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
      message: '',
      upgradeSuggested: false,
    };
  }

  const { data, error } = await supabase.rpc('billing_check_entitlement', {
    _workspace_id: workspaceId,
    _feature_key: featureKey,
    _increment_by: incrementBy,
    _action: action,
    _context: context as never,
    _commit_usage: commitUsage,
  });

  if (error) {
    // Falha de rede / RPC: não derrubar fluxo crítico — fail-open com aviso
    // (servidor é a fonte de verdade; aqui evitamos ficar offline-bricking UI).
    // eslint-disable-next-line no-console
    console.warn('[enforcement] RPC failure, falling back to allow:', error);
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
      message: '',
      upgradeSuggested: false,
    };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const flags = getEnforcementFlags();
  const serverMode = (raw.mode as EnforcementMode) ?? 'warn_only';
  const mode: EnforcementMode = flags.forcedMode ?? serverMode;
  const decision = (raw.decision as EntitlementDecision) ?? 'allowed';

  const result: EntitlementCheckResult = {
    allowed: Boolean(raw.allowed ?? true),
    mode,
    decision,
    featureKey: (raw.feature_key as string) ?? featureKey,
    currentUsage: Number(raw.current_usage ?? 0),
    limitValue:
      raw.limit_value === null || raw.limit_value === undefined
        ? null
        : Number(raw.limit_value),
    projectedUsage: Number(raw.projected_usage ?? 0),
    reasonCode: (raw.reason_code as EntitlementReasonCode) ?? null,
    overrideActive: Boolean(raw.override_active ?? false),
    upgradeSuggested:
      decision === 'warned' ||
      decision === 'soft_blocked' ||
      decision === 'hard_blocked',
    message: DEFAULT_MESSAGES[decision] ?? '',
  };

  return result;
}

/**
 * Lança quando a ação não é permitida. Use em mutations e handlers
 * que precisem interromper o fluxo cedo.
 */
export class EntitlementBlockedError extends Error {
  readonly result: EntitlementCheckResult;
  constructor(result: EntitlementCheckResult) {
    super(result.message ?? 'Action blocked by billing enforcement');
    this.name = 'EntitlementBlockedError';
    this.result = result;
  }
}

export async function assertEntitlement(
  args: EntitlementCheckArgs,
): Promise<EntitlementCheckResult> {
  const r = await checkEntitlement(args);
  if (!r.allowed) throw new EntitlementBlockedError(r);
  return r;
}

export async function decrementUsage(
  workspaceId: string,
  featureKey: string,
  by = 1,
): Promise<void> {
  const { error } = await supabase.rpc('billing_decrement_usage', {
    _workspace_id: workspaceId,
    _feature_key: featureKey,
    _decrement_by: by,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[enforcement] decrement failed:', error);
  }
}
