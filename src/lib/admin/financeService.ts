/**
 * Phase P2 — Global finance listings for the platform-owner backoffice.
 * Reads call platform_admin_list_* RPCs (server-side validates is_platform_admin).
 * Mutations reuse Phase H7 admin RPCs and the billing-mock edge function.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

export interface SubscriptionRow {
  subscription_id: string;
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  plan_code: string | null;
  plan_name: string | null;
  status: string;
  cancel_at_period_end: boolean | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  provider: string | null;
  updated_at: string | null;
  total_count: number;
}

export interface InvoiceRow {
  invoice_id: string;
  workspace_id: string;
  workspace_name: string;
  plan_code: string | null;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  total_count: number;
}

export interface DunningRow {
  case_id: string;
  workspace_id: string;
  workspace_name: string;
  invoice_id: string;
  subscription_id: string;
  status: string;
  retry_count: number;
  next_retry_at: string | null;
  grace_ends_at: string | null;
  created_at: string;
  updated_at: string;
  total_count: number;
}

export async function listSubscriptions(input: {
  search?: string;
  status?: string;
  planCode?: string;
  limit?: number;
  offset?: number;
}): Promise<SubscriptionRow[]> {
  const { data, error } = await rpc("platform_admin_list_subscriptions", {
    _search: input.search ?? null,
    _status: input.status ?? null,
    _plan_code: input.planCode ?? null,
    _limit: input.limit ?? 25,
    _offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriptionRow[];
}

export async function listInvoices(input: {
  search?: string;
  status?: string;
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}): Promise<InvoiceRow[]> {
  const { data, error } = await rpc("platform_admin_list_invoices", {
    _search: input.search ?? null,
    _status: input.status ?? null,
    _created_after: input.createdAfter ?? null,
    _created_before: input.createdBefore ?? null,
    _limit: input.limit ?? 25,
    _offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceRow[];
}

export async function listDunningCases(input: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<DunningRow[]> {
  const { data, error } = await rpc("platform_admin_list_dunning", {
    _search: input.search ?? null,
    _status: input.status ?? null,
    _limit: input.limit ?? 25,
    _offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DunningRow[];
}
