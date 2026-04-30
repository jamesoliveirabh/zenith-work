import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ChevronDown, ChevronRight, FolderKanban, Menu, LogOut, Plus, Check, Users, Users2, Settings2, Zap, Boxes, Shield, Activity, Lock, Target, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTeams } from "@/hooks/useTeams";
import { useMyOrgAccess } from "@/hooks/useOrgRole";
import { getTeamIcon } from "@/lib/teamIcon";

interface Space { id: string; name: string; color: string | null; team_id: string | null; }
interface List { id: string; name: string; space_id: string; }

const GENERAL_KEY = "__general__";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const { current, workspaces, setCurrent } = useWorkspace();
  const navigate = useNavigate();
  const { listId } = useParams();

  const { data: teams = [] } = useTeams();
  const { data: orgAccess } = useMyOrgAccess();
  const isOrgAdmin = !!orgAccess?.isOrgAdmin;
  const isGestor = !!orgAccess?.isGestor;
  const teamRoles = orgAccess?.teamRoles ?? {};

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [openSpaces, setOpenSpaces] = useState<Record<string, boolean>>({});
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});

  const [newSpaceTeamId, setNewSpaceTeamId] = useState<string | null | undefined>(undefined); // undefined = closed
  const [newListSpaceId, setNewListSpaceId] = useState<string | null>(null);

  const loadTree = async () => {
    if (!current) return;
    const [{ data: sp }, { data: ls }] = await Promise.all([
      supabase.from("spaces").select("id,name,color,team_id").eq("workspace_id", current.id).order("position"),
      supabase.from("lists").select("id,name,space_id").eq("workspace_id", current.id).order("position"),
    ]);
    setSpaces(sp ?? []);
    setLists(ls ?? []);
    if (sp) setOpenSpaces((prev) => {
      const next = { ...prev };
      sp.forEach((s) => { if (next[s.id] === undefined) next[s.id] = true; });
      return next;
    });
  };

  useEffect(() => { loadTree(); /* eslint-disable-next-line */ }, [current?.id]);

  // Filter teams to those the user belongs to (or all, if org admin)
  const visibleTeams = useMemo(() => {
    if (isOrgAdmin) return teams;
    return teams.filter((t) => teamRoles[t.id] !== undefined);
  }, [teams, teamRoles, isOrgAdmin]);

  // Group spaces by team_id
  const spacesByTeam = useMemo(() => {
    const map: Record<string, Space[]> = {};
    spaces.forEach((s) => {
      const key = s.team_id ?? GENERAL_KEY;
      (map[key] ||= []).push(s);
    });
    return map;
  }, [spaces]);

  const generalSpaces = spacesByTeam[GENERAL_KEY] ?? [];

  const canCreateSpaceForTeam = (teamId: string) =>
    isOrgAdmin || teamRoles[teamId] === "gestor";

  const handleCreateSpace = async (name: string) => {
    if (!current || !name.trim() || newSpaceTeamId === undefined) return;
    const { error } = await supabase.from("spaces").insert({
      workspace_id: current.id,
      name: name.trim(),
      created_by: user?.id,
      team_id: newSpaceTeamId,
    });
    if (error) return toast.error(error.message);
    toast.success("Space criado");
    setNewSpaceTeamId(undefined);
    loadTree();
  };

  const handleCreateList = async (name: string) => {
    if (!current || !newListSpaceId || !name.trim()) return;
    const { data, error } = await supabase.from("lists").insert({
      workspace_id: current.id, space_id: newListSpaceId, name: name.trim(), created_by: user?.id,
    }).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Lista criada");
    setNewListSpaceId(null);
    await loadTree();
    if (data) navigate(`/list/${data.id}`);
  };

  const renderSpaceItem = (s: Space) => {
    const spaceLists = lists.filter((l) => l.space_id === s.id);
    const open = openSpaces[s.id] ?? true;
    const spaceColor = s.color ?? "#6366f1";
    return (
      <div key={s.id}>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setOpenSpaces((p) => ({ ...p, [s.id]: !open }))}
            className="group rounded-lg"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            <Menu
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: spaceColor }}
            />
            {!collapsed && <span className="truncate">{s.name}</span>}
            {!collapsed && (
              <button
                onClick={(e) => { e.stopPropagation(); setNewListSpaceId(s.id); }}
                className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100"
                aria-label="Nova lista"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
        {open && !collapsed && spaceLists.map((l) => (
          <SidebarMenuItem key={l.id}>
            <SidebarMenuButton asChild isActive={listId === l.id} className="pl-10 rounded-lg">
              <NavLink to={`/list/${l.id}`}>
                <Menu className="h-3.5 w-3.5" />
                <span className="truncate">{l.name}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </div>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-2 hover:bg-sidebar-accent/60 transition-colors w-full text-left">
              <div className="h-9 w-9 rounded-lg gradient-active shadow-active shrink-0 flex items-center justify-center text-white font-bold text-sm">
                {(current?.name ?? "W")[0].toUpperCase()}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{current?.name ?? "Sem workspace"}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Workspace</div>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => setCurrent(w)}>
                <span className="flex-1 truncate">{w.name}</span>
                {current?.id === w.id && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/onboarding")}>
              <Plus className="h-4 w-4 mr-2" /> Novo workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/" end>
                    <Boxes className="h-4 w-4" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Teams → Spaces hierarchy */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setOpenTeams((p) => ({ ...p, __root: !(p.__root ?? true) }))}
                >
                  <LayoutGrid className="h-4 w-4" />
                  {!collapsed && <span>Equipes & Spaces</span>}
                  {!collapsed && (
                    (openTeams.__root ?? true)
                      ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                      : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {(openTeams.__root ?? true) && (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleTeams.map((team) => {
                const teamSpaces = spacesByTeam[team.id] ?? [];
                const open = openTeams[team.id] ?? true;
                const canCreate = canCreateSpaceForTeam(team.id);
                return (
                  <div key={team.id} className="mb-3 last:mb-0">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setOpenTeams((p) => ({ ...p, [team.id]: !open }))}
                        className="group"
                      >
                        {open ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                        {(() => {
                          const TeamIcon = getTeamIcon(team.name);
                          return (
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${team.color}, ${team.color}cc)`,
                                boxShadow: `0 2px 6px -1px ${team.color}66`,
                              }}
                              aria-hidden
                            >
                              <TeamIcon className="h-3.5 w-3.5 text-white" />
                            </span>
                          );
                        })()}
                        {!collapsed && <span className="truncate font-semibold text-[13px]">{team.name}</span>}
                        {!collapsed && canCreate && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setNewSpaceTeamId(team.id); }}
                            className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100"
                            aria-label="Criar novo espaço"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {open && (
                      <>
                        {teamSpaces.map(renderSpaceItem)}
                        {!collapsed && teamSpaces.length === 0 && (
                          <p className="px-9 py-2 text-xs text-muted-foreground">Nenhum espaço</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {visibleTeams.length === 0 && !collapsed && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Nenhuma equipe disponível.
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {/* Other features */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/goals">
                    <Target className="h-4 w-4" />
                    {!collapsed && <span>Metas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/automations">
                    <Zap className="h-4 w-4" />
                    {!collapsed && <span>Automações</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin / settings */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setOpenSpaces((p) => ({ ...p, __security: !(p.__security ?? true) }))}
                >
                  <Shield className="h-4 w-4" />
                  {!collapsed && <span>Configurações</span>}
                  {!collapsed && (
                    (openSpaces.__security ?? true)
                      ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                      : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              {(openSpaces.__security ?? true) && !collapsed && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="pl-9">
                      <NavLink to="/security/people">
                        <Users className="h-3.5 w-3.5" />
                        <span>Gestão de pessoas</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="pl-9">
                      <NavLink to="/security/permissions">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Permissões</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="pl-9">
                      <NavLink to="/security/spaces">
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span>Equipes & Spaces</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="pl-9">
                      <NavLink to="/settings/fields">
                        <Settings2 className="h-3.5 w-3.5" />
                        <span>Campos Personalizados</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="pl-9">
                      <NavLink to="/security" end>
                        <Activity className="h-3.5 w-3.5" />
                        <span>Logs</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 p-1">
          <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
            {(user?.email ?? "?")[0].toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{user?.email}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>

      {/* New space dialog (per team) */}
      <Dialog open={newSpaceTeamId !== undefined} onOpenChange={(v) => !v && setNewSpaceTeamId(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo space</DialogTitle>
            <DialogDescription>
              {newSpaceTeamId
                ? `O space será criado dentro da equipe selecionada.`
                : `Spaces agrupam listas por área ou departamento.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleCreateSpace(String(fd.get("name") ?? ""));
            }}
            className="space-y-3"
          >
            <Label htmlFor="space-name">Nome</Label>
            <Input id="space-name" name="name" autoFocus required />
            <DialogFooter>
              <Button type="submit">Criar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New list dialog */}
      <Dialog open={!!newListSpaceId} onOpenChange={(v) => !v && setNewListSpaceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova lista</DialogTitle>
            <DialogDescription>Listas guardam suas tarefas.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleCreateList(String(fd.get("name") ?? ""));
            }}
            className="space-y-3"
          >
            <Label htmlFor="list-name">Nome</Label>
            <Input id="list-name" name="name" autoFocus required />
            <DialogFooter>
              <Button type="submit">Criar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
