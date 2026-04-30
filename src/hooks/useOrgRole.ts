import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import type { OrgRole, TeamRole } from '@/types/org';

interface MyOrgAccess {
  orgRole: OrgRole;
  isOrgAdmin: boolean;
  isGestor: boolean;
  teamRoles: Record<string, TeamRole>;
}

export function useMyOrgAccess() {
  const { current } = useWorkspace();
  const { user } = useAuth();

  return useQuery({
    queryKey: ['org-access', current?.id, user?.id],
    enabled: !!current?.id && !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<MyOrgAccess> => {
      const [{ data: wm }, { data: tm }] = await Promise.all([
        supabase
          .from('workspace_members')
          .select('org_role')
          .eq('workspace_id', current!.id)
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('team_memberships')
          .select('team_id,role')
          .eq('workspace_id', current!.id)
          .eq('user_id', user!.id),
      ]);

      const orgRole = ((wm as { org_role?: OrgRole } | null)?.org_role) ?? 'member';
      const teamRoles = Object.fromEntries(
        (tm ?? []).map((r) => [r.team_id, r.role as TeamRole])
      );

      return {
        orgRole,
        isOrgAdmin: orgRole === 'admin',
        isGestor:
          orgRole === 'gestor' ||
          orgRole === 'admin' ||
          Object.values(teamRoles).includes('gestor'),
        teamRoles,
      };
    },
  });
}
