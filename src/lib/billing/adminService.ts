import { supabase } from '@/integrations/supabase/client';
import type {
  AdminAccountDetail, AdminAccountRow, AdminBillingMetrics,
} from '@/types/admin-billing';

/**
 * Phase H7 — Backoffice Admin Service.
 * Thin wrapper that talks to the platform-admin RPCs and the billing-mock
 * edge function. All write paths log to admin_actions_log either via the RPC
 * itself or via admin_billing_log_action.
 *
 * SECURITY: every admin RPC validates `is_platform_admin(auth.uid())` server-side.
 * Client-side guards are UX-only and MUST NOT be trusted.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

interface InvokeOptions { reason?: string }

async function invokeMock<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing-mock', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

/** Log a free-form admin action (rarely needed — most RPCs log themselves). */
export async function adminLogAction(input: {
  workspaceId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
}): Promise<string> {
  const { data, error } = await rpc('admin_billing_log_action', {
    _workspace_id: input.workspaceId,
    _action: input.action,
    _target_type: input.targetType ?? null,
    _target_id: input.targetId ?? null,
    _metadata: input.metadata ?? {},
    _reason: input.reason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// --- Reads ---------------------------------------------------------------

export async function listAccounts(input: {
  search?: string;
  planCode?: string;
  subStatus?: string;
  dunningStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminAccountRow[]> {
  const { data, error } = await rpc('admin_billing_list_accounts', {
    _search: input.search ?? null,
    _plan_code: input.planCode ?? null,
    _sub_status: input.subStatus ?? null,
    _dunning_status: input.dunningStatus ?? null,
    _limit: input.limit ?? 50,
    _offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminAccountRow[];
}

export async function getMetrics(windowDays = 30): Promise<AdminBillingMetrics> {
  const { data, error } = await rpc('admin_billing_metrics', { _window_days: windowDays });
  if (error) throw new Error(error.message);
  return data as AdminBillingMetrics;
}

export async function getAccountDetail(workspaceId: string): Promise<AdminAccountDetail> {
  const { data, error } = await rpc('admin_billing_account_detail', { _workspace_id: workspaceId });
  if (error) throw new Error(error.message);
  return data as AdminAccountDetail;
}

// --- Subscription ops ----------------------------------------------------

export async function adminChangePlan(input: {
  workspaceId: string; planId?: string; planCode?: string; mode?: 'immediate' | 'next_cycle';
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const r = await invokeMock<{ ok: boolean }>('subscription.change_plan', {
    workspaceId: input.workspaceId,
    planId: input.planId,
    planCode: input.planCode,
    mode: input.mode ?? 'immediate',
  });
  await adminLogAction({
    workspaceId: input.workspaceId,
    action: 'billing.admin.change_plan',
    targetType: 'workspace_subscription',
    targetId: input.workspaceId,
    metadata: { plan_code: input.planCode, plan_id: input.planId, mode: input.mode },
    reason: input.reason,
  });
  return r;
}

export async function adminScheduleCancel(input: { workspaceId: string } & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const r = await invokeMock('subscription.cancel', { workspaceId: input.workspaceId });
  await adminLogAction({
    workspaceId: input.workspaceId, action: 'billing.admin.schedule_cancel',
    targetType: 'workspace_subscription', targetId: input.workspaceId,
    reason: input.reason,
  });
  return r;
}

export async function adminResumeSubscription(input: { workspaceId: string } & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const r = await invokeMock('subscription.resume', { workspaceId: input.workspaceId });
  await adminLogAction({
    workspaceId: input.workspaceId, action: 'billing.admin.resume',
    targetType: 'workspace_subscription', targetId: input.workspaceId,
    reason: input.reason,
  });
  return r;
}

export async function adminExtendTrial(input: {
  workspaceId: string; additionalDays: number;
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const { data, error } = await rpc('admin_billing_extend_trial', {
    _workspace_id: input.workspaceId,
    _additional_days: input.additionalDays,
    _reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

// --- Invoice ops ---------------------------------------------------------

export async function adminGenerateInvoice(input: {
  workspaceId: string; amountCents: number; description?: string;
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const r = await invokeMock<{ invoice_id: string }>('invoice.generate', {
    workspaceId: input.workspaceId,
    amountCents: input.amountCents,
    description: input.description,
  });
  await adminLogAction({
    workspaceId: input.workspaceId, action: 'billing.admin.invoice_generated',
    targetType: 'invoice', targetId: r.invoice_id,
    metadata: { amount_cents: input.amountCents, description: input.description },
    reason: input.reason,
  });
  return r;
}

export async function adminMarkInvoice(input: {
  invoiceId: string; status: 'paid' | 'void' | 'uncollectible' | 'open';
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const { data, error } = await rpc('admin_billing_mark_invoice', {
    _invoice_id: input.invoiceId,
    _new_status: input.status,
    _reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

// --- Dunning ops ---------------------------------------------------------

export async function adminForceDunningRetry(input: {
  caseId: string; result?: 'paid' | 'failed';
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  return invokeMock('dunning.record_attempt', {
    caseId: input.caseId,
    result: input.result ?? 'failed',
    reason: input.reason,
  });
}

export async function adminExtendGracePeriod(input: {
  caseId: string; additionalDays: number;
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const { data, error } = await rpc('billing_dunning_extend_grace', {
    _case_id: input.caseId,
    _additional_days: input.additionalDays,
    _reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminCloseDunningCase(input: { caseId: string } & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const { data, error } = await rpc('billing_dunning_cancel_for_nonpayment', {
    _case_id: input.caseId, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

// --- Entitlement overrides ----------------------------------------------

export async function adminApplyEntitlementOverride(input: {
  workspaceId: string;
  mode: 'warn_only' | 'soft_block' | 'hard_block';
  featureKey: string | null;
  allowlisted: boolean;
  overrideUntil?: string | null;
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const { data, error } = await rpc('admin_billing_apply_entitlement_override', {
    _workspace_id: input.workspaceId,
    _mode: input.mode,
    _feature_key: input.featureKey,
    _allowlisted: input.allowlisted,
    _reason: input.reason,
    _override_until: input.overrideUntil ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function adminRemoveEntitlementOverride(input: {
  overrideId: string;
} & InvokeOptions) {
  if (!input.reason) throw new Error('reason required');
  const { error } = await rpc('admin_billing_remove_entitlement_override', {
    _override_id: input.overrideId, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}
