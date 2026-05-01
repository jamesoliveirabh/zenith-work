import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  Plan,
  WorkspaceSubscription,
  WorkspaceEntitlement,
} from '@/types/billing';

/**
 * Phase H1 — read-only billing foundation hooks.
 * No gateway integration; data is provisioned via backend/service-role.
 */

export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price_cents', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });
}

export function useWorkspaceSubscription(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['billing', 'subscription', workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceSubscription | null> => {
      const { data, error } = await supabase
        .from('workspace_subscriptions')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WorkspaceSubscription | null;
    },
  });
}

export function useWorkspaceEntitlements(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['billing', 'entitlements', workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceEntitlement[]> => {
      const { data, error } = await supabase
        .from('workspace_entitlements')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('feature_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkspaceEntitlement[];
    },
  });
}
