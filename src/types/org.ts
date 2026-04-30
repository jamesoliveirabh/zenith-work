export type OrgRole = 'admin' | 'gestor' | 'member';
export type TeamRole = 'gestor' | 'member';

export interface Team {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMembership {
  id: string;
  team_id: string;
  workspace_id: string;
  user_id: string;
  role: TeamRole;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

export interface SpaceMembership {
  id: string;
  space_id: string;
  team_id: string;
  workspace_id: string;
  user_id: string;
  created_at: string;
}

export interface TeamWithMembers extends Team {
  memberships: TeamMembership[];
  memberCount: number;
}
