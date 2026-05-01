import type {
  ChangePlanInput,
  CreateSubscriptionInput,
  GenerateInvoiceInput,
  InvoiceTargetInput,
  WorkspaceOnlyInput,
} from '@/types/billing';

/**
 * Phase H2 — Billing provider port.
 * Real providers (Stripe/Pagar.me) will implement this same interface so that
 * application code can stay agnostic. Today only the mock provider is wired.
 */
export interface BillingProviderAdapter {
  readonly id: 'mock' | 'stripe' | 'pagarme';

  createSubscription(input: CreateSubscriptionInput): Promise<{ subscription_id: string; status: string }>;
  changePlan(input: ChangePlanInput): Promise<{ mode: string; adjustment_invoice_id?: string; effective_at?: string | null }>;
  cancelSubscription(input: WorkspaceOnlyInput): Promise<{ ok: true }>;
  resumeSubscription(input: WorkspaceOnlyInput): Promise<{ ok: true }>;
  generateInvoice(input: GenerateInvoiceInput): Promise<{ invoice_id: string }>;
  markInvoicePaid(input: InvoiceTargetInput): Promise<{ ok: true }>;
  markInvoicePastDue(input: InvoiceTargetInput): Promise<{ invoice_status: string }>;
  closeExpiredCancellations(): Promise<{ closed: number }>;
}
