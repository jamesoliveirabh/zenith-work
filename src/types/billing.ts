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

// ---------------------------------------------------------------------------
// Phase H2 — engine types
// ---------------------------------------------------------------------------

export type BillingEventType =
  | 'subscription.created'
  | 'subscription.plan_changed'
  | 'subscription.cancel_scheduled'
  | 'subscription.resumed'
  | 'subscription.canceled'
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.payment_failed';

export type EffectiveMode = 'immediate' | 'next_cycle';

export interface PendingPlanChange {
  new_plan_id: string;
  new_plan_code: string;
  effective_at: string | null;
  scheduled_at: string;
}

export interface SubscriptionMetadata {
  pending_plan_change?: PendingPlanChange | null;
  [key: string]: unknown;
}

// DTOs
export interface CreateSubscriptionInput {
  workspaceId: string;
  planCode: string;
  trialDays?: number;
  providerEventId?: string;
}

export interface ChangePlanInput {
  workspaceId: string;
  newPlanCode: string;
  effectiveMode: EffectiveMode;
}

export interface WorkspaceOnlyInput {
  workspaceId: string;
}

export interface GenerateInvoiceInput {
  workspaceId: string;
  subscriptionId: string;
  amountDueCents: number;
  currency?: string;
  dueInDays?: number;
}

export interface InvoiceTargetInput {
  workspaceId: string;
  invoiceId: string;
  finalize?: boolean;
}

// ---------------------------------------------------------------------------
// Phase H4 — usage / entitlements view types
// ---------------------------------------------------------------------------

export type UsageStatus = 'ok' | 'warning' | 'critical' | 'unlimited';

export interface UsageItem {
  featureKey: string;
  label: string;
  unit?: string;
  currentUsage: number;
  limitValue: number | null; // null = ilimitado
  usagePct: number | null;
  status: UsageStatus;
}


