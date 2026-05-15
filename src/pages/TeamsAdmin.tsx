import { useState } from 'react';
import {
  useTeams,
  useCreateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMember,
  useRemoveTeamMember,
  useUpdateTeamMemberRole,
} from '@/hooks/useTeams';
import { useMyOrgAccess } from '@/hooks/useOrgRole';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Users, Plus, Trash2, UserPlus, Shield, Crown, Slack } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TeamSlackChannelPicker } from '@/components/TeamSlackChannelPicker';
import type { TeamRole } from '@/types/org';

function initials(name: string | null | undefined, email: string | null | undefined) {
  if (name) return name.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

interface WsMember {
  user_id: string;
  profile: { display_name: string | null; email: string | null; avatar_url: string | null } | null;
}

function TeamDetail({ teamId, wsMembers }: { teamId: string; wsMembers: WsMember[] }) {
  const { current: ws } = useWorkspace();
  const { data: members = [] } = useTeamMembers(teamId);
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const updateRole = useUpdateTeamMemberRole();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<TeamRole>('member');

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const available = wsMembers.filter((m) => !memberUserIds.has(m.user_id));

  const handleAdd = () => {
    if (!userId) return;
    addMember.mutate(
      { teamId, userId, role },
      {
        onSuccess: () => {
          setUserId('');
          setRole('member');
        },
      },
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Adicionar membro</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um membro do workspace" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Todos os membros já foram adicionados
                </div>
              )}
              {available.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.display_name ?? m.profile?.email ?? m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Papel</Label>
          <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gestor">Gestor</SelectItem>
              <SelectItem value="member">Membro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} disabled={!userId || addMember.isPending}>
          <UserPlus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
            <Avatar className="h-8 w-8">
              <AvatarImage src={m.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">
                {initials(m.profile?.display_name, m.profile?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {m.profile?.display_name ?? m.profile?.email ?? m.user_id}
              </div>
              {m.profile?.email && (
                <div className="text-xs text-muted-foreground truncate">{m.profile.email}</div>
              )}
            </div>
            <Select
              value={m.role}
              onValueChange={(v) =>
                updateRole.mutate({ membershipId: m.id, teamId, role: v as TeamRole })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gestor">
                  <span className="flex items-center gap-1">
                    <Crown className="h-3 w-3" /> Gestor
                  </span>
                </SelectItem>
                <SelectItem value="member">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Membro
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeMember.mutate({ membershipId: m.id, teamId })}
              aria-label="Remover"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum membro nesta equipe ainda.
          </p>
        )}
      </div>
    </div>
  );
}

export default function TeamsAdmin() {
  const { current } = useWorkspace();
  const { data: teams = [], isLoading } = useTeams();
  const { data: access } = useMyOrgAccess();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [wsMembers, setWsMembers] = useState<WsMember[]>([]);
  const [wsMembersLoaded, setWsMembersLoaded] = useState(false);

  const canCreate = !!(access?.isOrgAdmin || access?.isGestor);

  const loadWsMembers = async () => {
    if (wsMembersLoaded || !current) return;
    const { data: mems } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', current.id);
    const userIds = (mems ?? []).map((m) => m.user_id);
    if (userIds.length === 0) {
      setWsMembersLoaded(true);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,display_name,avatar_url,email')
      .in('id', userIds);
    const map = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
    setWsMembers(userIds.map((uid) => ({ user_id: uid, profile: map[uid] ?? null })));
    setWsMembersLoaded(true);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    createTeam.mutate(
      { name, description },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setName('');
          setDescription('');
        },
      },
    );
  };

  const handleSelectTeam = (id: string) => {
    setSelectedTeamId(id === selectedTeamId ? null : id);
    loadWsMembers();
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando equipes...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Equipes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie equipes e membros da organização.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova equipe
          </Button>
        )}
      </div>

      {teams.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma equipe criada ainda.
            {canCreate && ' Crie a primeira equipe para começar.'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {teams.map((team) => {
          const isOpen = selectedTeamId === team.id;
          const myRole = access?.teamRoles[team.id];
          const isMyTeamGestor = myRole === 'gestor';

          return (
            <Card key={team.id} className="overflow-hidden">
              <button
                type="button"
                className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
                onClick={() => handleSelectTeam(team.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-md shrink-0"
                    style={{ backgroundColor: team.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{team.name}</div>
                    {team.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {team.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isMyTeamGestor && (
                      <Badge variant="default" className="text-xs">
                        <Crown className="h-3 w-3 mr-1" /> Gestor
                      </Badge>
                    )}
                    {myRole && !isMyTeamGestor && (
                      <Badge variant="secondary" className="text-xs">
                        Membro
                      </Badge>
                    )}
                    {(access?.isOrgAdmin || isMyTeamGestor) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remover equipe "${team.name}"?`)) deleteTeam.mutate(team.id);
                        }}
                        aria-label="Remover equipe"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </button>

              {isOpen && (
                <>
                  <Separator />
                  {access?.isOrgAdmin || isMyTeamGestor ? (
                    <TeamDetail teamId={team.id} wsMembers={wsMembers} />
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      Apenas gestores desta equipe podem gerenciar membros.
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova equipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="team-name">Nome da equipe</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="team-desc">Descrição (opcional)</Label>
              <Input
                id="team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createTeam.isPending}>
              Criar equipe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
