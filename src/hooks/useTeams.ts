import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Team, TeamMembership, TeamRole } from '@/types/org';

export const teamsKey = (wsId: string) => ['teams', wsId] as const;
export const teamMembersKey = (teamId: string) => ['team-members', teamId] as const;

export function useTeams() {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: teamsKey(current?.id ?? ''),
    enabled: !!current?.id,
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase
        .from('teams')
        .select('id,workspace_id,name,description,color,created_by,created_at,updated_at')
        .eq('workspace_id', current!.id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Team[];
    },
  });
}

export function useTeamMembers(teamId: string | null | undefined) {
  return useQuery({
    queryKey: teamMembersKey(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async (): Promise<TeamMembership[]> => {
      const { data, error } = await supabase
        .from('team_memberships')
        .select('id,team_id,workspace_id,user_id,role,created_at')
        .eq('team_id', teamId!);
      if (error) throw error;
      const members = data ?? [];
      const userIds = Array.from(new Set(members.map((m) => m.user_id)));
      if (userIds.length === 0) return members as TeamMembership[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,display_name,avatar_url,email')
        .in('id', userIds);
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      return members.map((m) => ({
        ...m,
        profile: profileMap[m.user_id] ?? null,
      })) as TeamMembership[];
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; color?: string }) => {
      const { data, error } = await supabase
        .from('teams')
        .insert({
          workspace_id: current!.id,
          created_by: user!.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          color: input.color ?? '#6366f1',
        })
        .select('id,workspace_id,name,description,color,created_by,created_at,updated_at')
        .single();
      if (error) throw error;
      return data as Team;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success('Equipe criada'),
    onSettled: () => qc.invalidateQueries({ queryKey: teamsKey(current?.id ?? '') }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Team, 'name' | 'description' | 'color'>> }) => {
      const { error } = await supabase.from('teams').update(patch).eq('id', id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success('Equipe atualizada'),
    onSettled: () => qc.invalidateQueries({ queryKey: teamsKey(current?.id ?? '') }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success('Equipe removida'),
    onSettled: () => qc.invalidateQueries({ queryKey: teamsKey(current?.id ?? '') }),
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async ({ teamId, userId, role }: { teamId: string; userId: string; role: TeamRole }) => {
      const { error } = await supabase.from('team_memberships').insert({
        team_id: teamId,
        workspace_id: current!.id,
        user_id: userId,
        role,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success('Membro adicionado à equipe');
      qc.invalidateQueries({ queryKey: teamMembersKey(vars.teamId) });
    },
  });
}

export function useUpdateTeamMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: string; teamId: string; role: TeamRole }) => {
      const { error } = await supabase
        .from('team_memberships')
        .update({ role })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success('Papel atualizado');
      qc.invalidateQueries({ queryKey: teamMembersKey(vars.teamId) });
    },
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId }: { membershipId: string; teamId: string }) => {
      const { error } = await supabase.from('team_memberships').delete().eq('id', membershipId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (_d, vars) => {
      toast.success('Membro removido da equipe');
      qc.invalidateQueries({ queryKey: teamMembersKey(vars.teamId) });
    },
  });
}
