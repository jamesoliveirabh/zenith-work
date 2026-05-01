import { supabase } from '@/integrations/supabase/client';
import type { BillingProviderAdapter } from './provider';
import type {
  ChangePlanInput,
  CreateSubscriptionInput,
  GenerateInvoiceInput,
  InvoiceTargetInput,
  WorkspaceOnlyInput,
} from '@/types/billing';

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing-mock', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

/**
 * MockBillingProvider — talks to the `billing-mock` edge function.
 * No real gateway involved; used for homologation and demos.
 */
export const mockBillingProvider: BillingProviderAdapter = {
  id: 'mock',

  createSubscription: (input: CreateSubscriptionInput) =>
    call('subscription.create', input),

  changePlan: (input: ChangePlanInput) =>
    call('subscription.change_plan', input),

  cancelSubscription: (input: WorkspaceOnlyInput) =>
    call('subscription.cancel', input),

  resumeSubscription: (input: WorkspaceOnlyInput) =>
    call('subscription.resume', input),

  generateInvoice: (input: GenerateInvoiceInput) =>
    call('invoice.generate', input),

  markInvoicePaid: (input: InvoiceTargetInput) =>
    call('invoice.mark_paid', input),

  markInvoicePastDue: (input: InvoiceTargetInput) =>
    call('invoice.simulate_failure', input),

  closeExpiredCancellations: () =>
    call('subscription.close_expired', {}),
};
