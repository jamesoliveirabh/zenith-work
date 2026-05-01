// Phase H6 — Dunning policy types & defaults (client mirror).
// The source of truth lives in the DB table `billing_dunning_policies`.

export interface DunningPolicy {
  id: string;
  workspace_id: string | null;
  max_retries: number;
  retry_schedule_days: number[];
  grace_period_days: number;
  auto_cancel_after_grace: boolean;
  pause_features_during_past_due: boolean;
  enforcement_mode_during_past_due: 'warn_only' | 'soft_block' | 'hard_block';
  created_at: string;
  updated_at: string;
}

export const DEFAULT_DUNNING_POLICY: Omit<DunningPolicy, 'id' | 'created_at' | 'updated_at' | 'workspace_id'> = {
  max_retries: 3,
  retry_schedule_days: [1, 3, 5],
  grace_period_days: 7,
  auto_cancel_after_grace: true,
  pause_features_during_past_due: false,
  enforcement_mode_during_past_due: 'soft_block',
};

export type DunningCaseStatus =
  | 'open' | 'recovering' | 'recovered' | 'exhausted' | 'canceled';

export interface DunningCase {
  id: string;
  workspace_id: string;
  subscription_id: string;
  invoice_id: string;
  status: DunningCaseStatus;
  retry_count: number;
  next_retry_at: string | null;
  grace_ends_at: string | null;
  closed_at: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DunningAttempt {
  id: string;
  dunning_case_id: string;
  workspace_id: string;
  attempt_number: number;
  attempted_at: string;
  result: 'failed' | 'paid' | 'skipped';
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const DUNNING_OPEN_STATES: DunningCaseStatus[] = ['open', 'recovering', 'exhausted'];
export const DUNNING_CLOSED_STATES: DunningCaseStatus[] = ['recovered', 'canceled'];

export function isDunningActive(status: DunningCaseStatus | null | undefined): boolean {
  return !!status && DUNNING_OPEN_STATES.includes(status);
}

/** Tone progression: 0 = mild, 1 = warning, 2 = critical. */
export function dunningToneFromAttempt(retryCount: number, maxRetries: number): 0 | 1 | 2 {
  if (retryCount === 0) return 0;
  if (retryCount >= maxRetries) return 2;
  return 1;
}
