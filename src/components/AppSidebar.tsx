import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ChevronDown, ChevronRight, FolderKanban, Hash, LogOut, Plus, Check, Users, Settings2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Space { id: string; name: string; color: string | null; }
interface List { id: string; name: string; space_id: string; }

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const { current, workspaces, setCurrent } = useWorkspace();
  const navigate = useNavigate();
  const { listId } = useParams();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [openSpaces, setOpenSpaces] = useState<Record<string, boolean>>({});

  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newListSpaceId, setNewListSpaceId] = useState<string | null>(null);

  const loadTree = async () => {
    if (!current) return;
    const [{ data: sp }, { data: ls }] = await Promise.all([
      supabase.from("spaces").select("id,name,color").eq("workspace_id", current.id).order("position"),
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

  const handleCreateSpace = async (name: string) => {
    if (!current || !name.trim()) return;
    const { error } = await supabase.from("spaces").insert({
      workspace_id: current.id, name: name.trim(), created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Space criado");
    setNewSpaceOpen(false);
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

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-2 hover:bg-sidebar-accent transition-colors w-full text-left">
              <div className="h-8 w-8 rounded-md gradient-primary shrink-0" />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{current?.name ?? "Sem workspace"}</div>
                  <div className="text-xs text-muted-foreground">Workspace</div>
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
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between pr-2">
            <span>Spaces</span>
            <Dialog open={newSpaceOpen} onOpenChange={setNewSpaceOpen}>
              <DialogTrigger asChild>
                <button className="opacity-60 hover:opacity-100" aria-label="Novo space">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo space</DialogTitle>
                  <DialogDescription>Spaces agrupam listas por área ou departamento.</DialogDescription>
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
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {spaces.map((s) => {
                const spaceLists = lists.filter((l) => l.space_id === s.id);
                const open = openSpaces[s.id] ?? true;
                return (
                  <div key={s.id}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setOpenSpaces((p) => ({ ...p, [s.id]: !open }))}
                        className="group"
                      >
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        <FolderKanban className="h-4 w-4" style={{ color: s.color ?? undefined }} />
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
                        <SidebarMenuButton asChild isActive={listId === l.id} className="pl-9">
                          <NavLink to={`/list/${l.id}`}>
                            <Hash className="h-3.5 w-3.5" />
                            <span className="truncate">{l.name}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </div>
                );
              })}
              {spaces.length === 0 && !collapsed && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Crie seu primeiro space
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/team">
                    <Users className="h-4 w-4" />
                    {!collapsed && <span>Equipe</span>}
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
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/settings/fields">
                    <Settings2 className="h-4 w-4" />
                    {!collapsed && <span>Campos</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
