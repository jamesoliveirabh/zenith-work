export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export type BillingProvider = 'mock' | 'stripe' | 'pagarme';

export type PlanInterval = 'month' | 'year';

export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible';

export interface PlanLimits {
  members?: number;
  automations?: number;
  storage_gb?: number;
  [key: string]: number | undefined;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  interval: PlanInterval;
  is_active: boolean;
  limits_json: PlanLimits;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSubscription {
  id: string;
  workspace_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  billing_provider: BillingProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceEntitlement {
  id: string;
  workspace_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  current_usage: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInvoice {
  id: string;
  workspace_id: string;
  subscription_id: string | null;
  provider_invoice_id: string | null;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: InvoiceStatus;
  due_at: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
  updated_at: string;
}
