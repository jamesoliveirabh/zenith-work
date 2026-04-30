import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import type { SpaceMembership } from '@/types/org';

export const spaceMembershipsKey = (spaceId: string) => ['space-memberships', spaceId] as const;

type SpaceMemberWithProfile = SpaceMembership & {
  profile?: { display_name: string | null; avatar_url: string | null; email: string | null } | null;
};

export function useSpaceMembers(spaceId: string | null | undefined) {
  return useQuery({
    queryKey: spaceMembershipsKey(spaceId ?? ''),
    enabled: !!spaceId,
    queryFn: async (): Promise<SpaceMemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('space_memberships')
        .select('id,space_id,team_id,workspace_id,user_id,created_at')
        .eq('space_id', spaceId!);
      if (error) throw error;
      const members = (data ?? []) as SpaceMembership[];
      const userIds = Array.from(new Set(members.map((m) => m.user_id)));
      if (userIds.length === 0) return members;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,display_name,avatar_url,email')
        .in('id', userIds);
      const map = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      return members.map((m) => ({ ...m, profile: map[m.user_id] ?? null }));
    },
  });
}

export function useAddSpaceMember() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async ({ spaceId, teamId, userId }: { spaceId: string; teamId: string; userId: string }) => {
      const { error } = await supabase.from('space_memberships').insert({
        space_id: spaceId,
        team_id: teamId,
        workspace_id: current!.id,
        user_id: userId,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success('Acesso ao space concedido');
      qc.invalidateQueries({ queryKey: spaceMembershipsKey(vars.spaceId) });
    },
  });
}

export function useRemoveSpaceMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId }: { membershipId: string; spaceId: string }) => {
      const { error } = await supabase.from('space_memberships').delete().eq('id', membershipId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success('Acesso removido');
      qc.invalidateQueries({ queryKey: spaceMembershipsKey(vars.spaceId) });
    },
  });
}
