// Phase H6 — Client-side dunning service.
// Wraps the `billing-mock` edge function for dunning operations.
// Real provider integration (Stripe webhooks) will replace these calls.

import { supabase } from '@/integrations/supabase/client';

async function call<T>(action: string, payload: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing-mock', {
    body: { action, ...(payload as Record<string, unknown>) },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export interface RecordAttemptResult {
  status?: 'recovered' | 'recovering' | 'exhausted';
  attempt?: number;
  next_retry_at?: string | null;
  skipped?: boolean;
  reason?: string;
}

/** Record a manual attempt result on a dunning case (admin only). */
export function dunningRecordAttempt(input: {
  caseId: string;
  result: 'paid' | 'failed' | 'skipped';
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<RecordAttemptResult> {
  return call('dunning.record_attempt', input);
}

/** Process all due retries (idempotent scheduler entrypoint). */
export function dunningProcessDue(input: { forceResult?: 'paid' | 'failed'; limit?: number } = {}) {
  return call<{ ok: true; processed_count: number; processed: unknown[] }>(
    'dunning.process_due', input,
  );
}

/** Process expired grace periods (idempotent). */
export function dunningProcessExpired() {
  return call<{ ok: true; closed: number }>('dunning.process_expired', {});
}

/** Admin: extend grace period of a case. */
export function dunningExtendGrace(input: { caseId: string; additionalDays: number; reason: string }) {
  return call<{ ok: true; case: unknown }>('dunning.extend_grace', input);
}

/** Admin: cancel subscription due to non-payment immediately. */
export function dunningCancelNonpayment(input: { caseId: string; reason: string }) {
  return call<{ ok: true; case: unknown }>('dunning.cancel_nonpayment', input);
}

/** Mock: simulate a payment method update — recovers all open cases of a workspace. */
export function dunningSimulatePaymentMethodUpdate(input: { workspaceId: string }) {
  return call<{ ok: true; recovered_cases: number }>(
    'dunning.simulate_payment_method_update', input,
  );
}

/** Mock: simulate a single retry success on a case. */
export function dunningSimulateRetrySuccess(input: { caseId: string }) {
  return dunningRecordAttempt({ caseId: input.caseId, result: 'paid', reason: 'qa_simulated_success' });
}

/** Mock: simulate a single retry failure on a case. */
export function dunningSimulateRetryFailure(input: { caseId: string; reason?: string }) {
  return dunningRecordAttempt({
    caseId: input.caseId, result: 'failed', reason: input.reason ?? 'qa_simulated_failure',
  });
}
