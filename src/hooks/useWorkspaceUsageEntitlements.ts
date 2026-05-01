import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceEntitlements } from './useBillingFoundation';
import {
  FEATURE_REGISTRY,
  buildUsageItem,
} from '@/lib/billing/usage';
import type { UsageItem } from '@/types/billing';

interface RawUsage {
  members: number;
  automations: number;
  storage_gb: number;
  published_docs: number;
  active_goals: number;
}

async function fetchWorkspaceUsage(workspaceId: string): Promise<RawUsage> {
  const [
    membersRes, autosRes, attachRes, docsRes, goalsRes,
  ] = await Promise.all([
    supabase.from('workspace_members').select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase.from('automations').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('is_active', true),
    // Storage usage approximated via task_attachments file sizes
    supabase.from('task_attachments').select('file_size_bytes')
      .eq('workspace_id', workspaceId),
    supabase.from('docs').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('is_published', true),
    supabase.from('goals').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('is_archived', false),
  ]);

  const totalBytes = (attachRes.data ?? [])
    .reduce((acc: number, r: { file_size_bytes: number | null }) => acc + (r.file_size_bytes ?? 0), 0);
  const storageGb = totalBytes / (1024 * 1024 * 1024);

  // TODO(billing-usage): incluir doc_images/doc_covers do storage quando endpoint admin estiver disponível.
  return {
    members: membersRes.count ?? 0,
    automations: autosRes.count ?? 0,
    storage_gb: Number(storageGb.toFixed(4)),
    published_docs: docsRes.count ?? 0,
    active_goals: goalsRes.count ?? 0,
  };
}

export function useWorkspaceUsageEntitlements(workspaceId?: string | null) {
  const ents = useWorkspaceEntitlements(workspaceId);

  const usage = useQuery({
    queryKey: ['billing', 'usage-metrics', workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: () => fetchWorkspaceUsage(workspaceId!),
  });

  const items: UsageItem[] = (() => {
    const ent = ents.data ?? [];
    const u = usage.data;
    if (!u) return [];

    const limitsByKey = new Map<string, { enabled: boolean; limit_value: number | null }>(
      ent.map((e) => [e.feature_key, { enabled: e.enabled, limit_value: e.limit_value }]),
    );

    const usageMap: Record<string, number> = {
      members: u.members,
      automations: u.automations,
      storage_gb: u.storage_gb,
      published_docs: u.published_docs,
      active_goals: u.active_goals,
    };

    return Object.keys(FEATURE_REGISTRY)
      .map((key) => {
        const ent = limitsByKey.get(key);
        // limit semantics:
        //  - ent ausente: tratamos como ilimitado (plano não declara)
        //  - ent.enabled === false: feature desabilitada (limit 0)
        //  - ent.limit_value === null: ilimitado
        let limit: number | null;
        if (!ent) limit = null;
        else if (ent.enabled === false) limit = 0;
        else limit = ent.limit_value;

        return buildUsageItem(key, usageMap[key] ?? 0, limit);
      })
      .sort((a, b) => (FEATURE_REGISTRY[a.featureKey]?.order ?? 99) - (FEATURE_REGISTRY[b.featureKey]?.order ?? 99));
  })();

  const aggregateStatus: 'ok' | 'warning' | 'critical' = items.some((i) => i.status === 'critical')
    ? 'critical'
    : items.some((i) => i.status === 'warning')
      ? 'warning'
      : 'ok';

  return {
    items,
    aggregateStatus,
    isLoading: ents.isLoading || usage.isLoading,
    isError: ents.isError || usage.isError,
    refetch: async () => {
      await Promise.all([ents.refetch(), usage.refetch()]);
    },
  };
}

/**
 * Best-effort sync of `workspace_entitlements.current_usage` from real metrics.
 * Non-blocking: callers should not await criticalmente.
 *
 * TODO(billing-usage-h5): mover para edge function com service-role para
 * evitar limitações de RLS quando member não tem permissão de update.
 */
export function useSyncEntitlementUsage() {
  const qc = useQueryClient();
  return async (workspaceId: string) => {
    try {
      const u = await fetchWorkspaceUsage(workspaceId);
      const map: Record<string, number> = {
        members: u.members,
        automations: u.automations,
        storage_gb: Math.round(u.storage_gb),
        published_docs: u.published_docs,
        active_goals: u.active_goals,
      };
      // Optimistic update local cache only; persistence requires elevated role.
      qc.setQueryData(['billing', 'usage-metrics', workspaceId], u);
      return map;
    } catch {
      return null;
    }
  };
}
