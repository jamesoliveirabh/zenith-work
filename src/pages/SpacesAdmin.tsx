import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FolderKanban, Hash, MoreVertical, Pencil, Trash2, UserCog, Crown, Shield, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/hooks/usePermission";

interface Space { id: string; name: string; color: string | null; created_at: string; created_by: string | null; }
interface Member { user_id: string; role: string; profile?: { display_name: string | null; email: string | null } }
interface ListRow { id: string; name: string; space_id: string; }

export default function SpacesAdmin() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const isAdmin = usePermission("manage_users"); // admins have all perms
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaceOwner, setWorkspaceOwner] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [renameSpace, setRenameSpace] = useState<Space | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteSpace, setDeleteSpace] = useState<Space | null>(null);
  const [deleteTaskCount, setDeleteTaskCount] = useState<number>(0);
  const [deleteMode, setDeleteMode] = useState<"move" | "force">("move");
  const [moveTargetSpace, setMoveTargetSpace] = useState<string>("");
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [transferSpace, setTransferSpace] = useState<Space | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>("");

  const load = async () => {
    if (!current) return;
    const [sp, ls, mb, ws] = await Promise.all([
      supabase.from("spaces").select("id,name,color,created_at,created_by").eq("workspace_id", current.id).order("position"),
      supabase.from("lists").select("id,name,space_id").eq("workspace_id", current.id),
      supabase.from("workspace_members").select("user_id, role").eq("workspace_id", current.id),
      supabase.from("workspaces").select("owner_id").eq("id", current.id).single(),
    ]);
    setSpaces(sp.data ?? []);
    setLists(ls.data ?? []);
    setWorkspaceOwner(ws.data?.owner_id ?? null);

    const ids = (mb.data ?? []).map((m) => m.user_id);
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
      setMembers((mb.data ?? []).map((m) => ({
        ...m,
        profile: profs?.find((p) => p.id === m.user_id) ?? undefined,
      })));
    } else setMembers([]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  const memberLabel = (uid: string | null) => {
    if (!uid) return "—";
    const m = members.find((x) => x.user_id === uid);
    return m?.profile?.display_name ?? m?.profile?.email ?? uid.slice(0, 8);
  };

  const handleRename = async () => {
    if (!renameSpace || !renameValue.trim()) return;
    const { error } = await supabase.from("spaces").update({ name: renameValue.trim() }).eq("id", renameSpace.id);
    if (error) return toast.error(error.message);
    toast.success("Space renomeado");
    setRenameSpace(null);
    load();
  };

  const openDelete = async (s: Space) => {
    setDeleteSpace(s);
    setDeleteMode("move");
    setMoveTargetSpace("");
    setConfirmName("");
    setDeleteTaskCount(0);
    // Count tasks in lists belonging to this space
    const spaceListIds = lists.filter((l) => l.space_id === s.id).map((l) => l.id);
    if (spaceListIds.length > 0) {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("list_id", spaceListIds);
      setDeleteTaskCount(count ?? 0);
    }
  };

  const handleDelete = async () => {
    if (!deleteSpace) return;
    const spaceLists = lists.filter((l) => l.space_id === deleteSpace.id);

    // Block when forcing delete with content but name not confirmed
    if (spaceLists.length > 0 && deleteMode === "force" && confirmName.trim() !== deleteSpace.name) {
      return toast.error("Digite o nome exato do space para confirmar.");
    }
    if (spaceLists.length > 0 && deleteMode === "move" && !moveTargetSpace) {
      return toast.error("Selecione um space de destino para mover as listas.");
    }

    setDeleting(true);
    try {
      // Move lists if requested
      if (spaceLists.length > 0 && deleteMode === "move") {
        const { error: mvErr } = await supabase
          .from("lists")
          .update({ space_id: moveTargetSpace })
          .in("id", spaceLists.map((l) => l.id));
        if (mvErr) throw mvErr;
      }

      const { error } = await supabase.from("spaces").delete().eq("id", deleteSpace.id);
      if (error) throw error;

      toast.success(
        spaceLists.length > 0 && deleteMode === "move"
          ? `Space excluído. ${spaceLists.length} lista(s) movida(s).`
          : "Space excluído"
      );
      setDeleteSpace(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const handleTransferOwner = async () => {
    if (!transferSpace || !transferTarget) return;
    const { error } = await supabase.from("spaces").update({ created_by: transferTarget }).eq("id", transferSpace.id);
    if (error) return toast.error(error.message);
    toast.success("Proprietário do space atualizado");
    setTransferSpace(null);
    setTransferTarget("");
    load();
  };

  const filtered = spaces.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  if (!current) return null;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderKanban className="h-6 w-6" /> Gestão de Spaces
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualize todos os spaces do workspace, transfira propriedade ou exclua.
          </p>
        </div>
        {isAdmin === false && (
          <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> Somente leitura</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spaces ({spaces.length})</CardTitle>
          <CardDescription>Cada space agrupa listas de tarefas.</CardDescription>
          <Input
            placeholder="Buscar space..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3 max-w-sm"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Listas</TableHead>
                <TableHead>Proprietário</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const spaceLists = lists.filter((l) => l.space_id === s.id);
                const isWsOwner = s.created_by === workspaceOwner;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded" style={{ background: s.color ?? "hsl(var(--muted))" }} />
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {spaceLists.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma</span>}
                        {spaceLists.slice(0, 3).map((l) => (
                          <Badge key={l.id} variant="secondary" className="gap-1">
                            <Hash className="h-3 w-3" />{l.name}
                          </Badge>
                        ))}
                        {spaceLists.length > 3 && (
                          <Badge variant="outline">+{spaceLists.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {isWsOwner && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                        <span className="text-sm">{memberLabel(s.created_by)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={!isAdmin}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setRenameSpace(s); setRenameValue(s.name); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setTransferSpace(s); setTransferTarget(s.created_by ?? ""); }}>
                            <UserCog className="h-4 w-4 mr-2" /> Transferir proprietário
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDelete(s)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir space
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum space encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Rename */}
      <Dialog open={!!renameSpace} onOpenChange={(v) => !v && setRenameSpace(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear space</DialogTitle>
            <DialogDescription>Atualize o nome de "{renameSpace?.name}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename">Novo nome</Label>
            <Input id="rename" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSpace(null)}>Cancelar</Button>
            <Button onClick={handleRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer owner */}
      <Dialog open={!!transferSpace} onOpenChange={(v) => !v && setTransferSpace(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir proprietário</DialogTitle>
            <DialogDescription>
              Escolha o novo proprietário do space "{transferSpace?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Novo proprietário</Label>
            <Select value={transferTarget} onValueChange={setTransferTarget}>
              <SelectTrigger><SelectValue placeholder="Selecione um membro" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profile?.display_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                    <span className="text-muted-foreground ml-2">({m.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferSpace(null)}>Cancelar</Button>
            <Button onClick={handleTransferOwner} disabled={!transferTarget}>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteSpace} onOpenChange={(v) => !v && setDeleteSpace(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir space?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o space "{deleteSpace?.name}" e pode afetar listas vinculadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
