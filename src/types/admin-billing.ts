// Phase H7 — Admin Billing types

export interface AdminAccountRow {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  price_cents: number | null;
  currency: string | null;
  plan_interval: string | null;
  subscription_id: string | null;
  sub_status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  provider: string | null;
  dunning_status: string | null;
  open_dunning_case_id: string | null;
  updated_at: string | null;
  total_count: number;
}

export interface AdminBillingMetrics {
  total_accounts: number;
  past_due: number;
  open_dunning_cases: number;
  recent_cancellations: number;
  recent_recoveries: number;
  mrr_cents_estimate: number;
  window_days: number;
}

export interface AdminAccountDetail {
  workspace: Record<string, unknown> | null;
  owner: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  invoices: Array<Record<string, unknown>>;
  dunning_case: Record<string, unknown> | null;
  dunning_attempts: Array<Record<string, unknown>>;
  entitlements: Array<Record<string, unknown>>;
  overrides: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  admin_actions: Array<Record<string, unknown>>;
}

export interface AdminAccountsFilters {
  search?: string;
  planCode?: string;
  subStatus?: string;
  dunningStatus?: string;
  page?: number;
  pageSize?: number;
}
