import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WorkspaceInvoice, BillingEventType } from '@/types/billing';

export interface BillingEvent {
  id: string;
  workspace_id: string;
  subscription_id: string | null;
  provider: string;
  provider_event_id: string | null;
  event_type: BillingEventType | string;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

export function useWorkspaceInvoices(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['billing', 'invoices', workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<WorkspaceInvoice[]> => {
      const { data, error } = await supabase
        .from('workspace_invoices')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WorkspaceInvoice[];
    },
  });
}

export function useBillingEvents(workspaceId?: string | null, limit = 30) {
  return useQuery({
    queryKey: ['billing', 'events', workspaceId, limit],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<BillingEvent[]> => {
      const { data, error } = await supabase
        .from('billing_events')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as BillingEvent[];
    },
  });
}
