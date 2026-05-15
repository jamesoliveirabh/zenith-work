import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LayoutGrid, Plus, Pencil, Trash2, FolderKanban, Check, X } from "lucide-react";
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from "@/hooks/useTeams";
import { useSpacesAdmin, useCreateSpace, useUpdateSpace, useDeleteSpace, type Space } from "@/hooks/useSpaces";
import { useMyOrgAccess } from "@/hooks/useOrgRole";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { SpaceSlackChannelPicker } from "@/components/SpaceSlackChannelPicker";
import type { Team } from "@/types/org";

type EditTarget = { kind: "team" | "space"; id: string } | null;
type DeleteTarget =
  | { kind: "team"; team: Team }
  | { kind: "space"; space: Space }
  | null;

export default function SpacesAdmin() {
  const { data: teams = [] } = useTeams();
  const { data: spaces = [] } = useSpacesAdmin();
  const { data: orgAccess } = useMyOrgAccess();
  const { current: currentWorkspace } = useWorkspace();

  const isOrgAdmin = !!orgAccess?.isOrgAdmin;
  const isGestor = !!orgAccess?.isGestor;
  const teamRoles = orgAccess?.teamRoles ?? {};

  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();
  const deleteSpace = useDeleteSpace();

  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const [newSpaceTeamId, setNewSpaceTeamId] = useState<string | null | undefined>(undefined);
  const [newSpaceName, setNewSpaceName] = useState("");

  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editValue, setEditValue] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const spacesByTeam = useMemo(() => {
    const map: Record<string, Space[]> = {};
    spaces.forEach((s) => {
      if (!s.team_id) return;
      (map[s.team_id] ||= []).push(s);
    });
    return map;
  }, [spaces]);

  // Permission gate
  if (orgAccess && !isOrgAdmin && !isGestor) {
    return (
      <div className="container max-w-4xl py-12">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Apenas administradores e gestores podem gerenciar equipes e spaces.
          </CardContent>
        </Card>
      </div>
    );
  }

  const canManageTeam = (teamId: string) =>
    isOrgAdmin || teamRoles[teamId] === "gestor";

  const startEdit = (kind: "team" | "space", id: string, currentName: string) => {
    setEditTarget({ kind, id });
    setEditValue(currentName);
  };

  const saveEdit = async () => {
    if (!editTarget || !editValue.trim()) return;
    if (editTarget.kind === "team") {
      await updateTeam.mutateAsync({ id: editTarget.id, patch: { name: editValue.trim() } });
    } else {
      await updateSpace.mutateAsync({ id: editTarget.id, patch: { name: editValue.trim() } });
    }
    setEditTarget(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setEditValue("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "team") {
      await deleteTeam.mutateAsync(deleteTarget.team.id);
    } else {
      await deleteSpace.mutateAsync(deleteTarget.space.id);
    }
    setDeleteTarget(null);
  };

  const submitNewTeam = async () => {
    if (!newTeamName.trim()) return;
    await createTeam.mutateAsync({ name: newTeamName.trim() });
    setNewTeamOpen(false);
    setNewTeamName("");
  };

  const submitNewSpace = async () => {
    if (!newSpaceName.trim() || !newSpaceTeamId) return;
    await createSpace.mutateAsync({ name: newSpaceName.trim(), team_id: newSpaceTeamId });
    setNewSpaceTeamId(undefined);
    setNewSpaceName("");
  };

  const renderSpaceRow = (s: Space, canManage: boolean) => {
    const isEditing = editTarget?.kind === "space" && editTarget.id === s.id;
    return (
      <div
        key={s.id}
        className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 hover:bg-accent/30 transition-colors"
      >
        <FolderKanban className="h-4 w-4 shrink-0" style={{ color: s.color ?? undefined }} />
        {isEditing ? (
          <>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              className="h-8 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-sm">{s.name}</span>
            {canManage && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-60 hover:opacity-100"
                  onClick={() => startEdit("space", s.id, s.name)}
                  aria-label="Editar nome"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-60 hover:opacity-100 text-destructive"
                  onClick={() => setDeleteTarget({ kind: "space", space: s })}
                  aria-label="Excluir space"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutGrid className="h-6 w-6" /> Equipes & Spaces
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize equipes e seus spaces em uma única visão.
          </p>
        </div>
        {isOrgAdmin && (
          <Button onClick={() => setNewTeamOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Equipe
          </Button>
        )}
      </div>

      {/* Teams */}
      <div className="space-y-4">
        {teams.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma equipe criada ainda.
            </CardContent>
          </Card>
        )}

        {teams.map((team) => {
          const teamSpaces = spacesByTeam[team.id] ?? [];
          const canManage = canManageTeam(team.id);
          const isEditingTeam = editTarget?.kind === "team" && editTarget.id === team.id;
          return (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: team.color }}
                    aria-hidden
                  />
                  {isEditingTeam ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                        className="h-8 max-w-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <CardTitle className="text-base">{team.name}</CardTitle>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({teamSpaces.length} space{teamSpaces.length !== 1 ? "s" : ""})
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setNewSpaceTeamId(team.id);
                                setNewSpaceName("");
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Criar novo espaço
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => startEdit("team", team.id, team.name)}
                              aria-label="Editar nome"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {isOrgAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setDeleteTarget({ kind: "team", team })}
                                aria-label="Excluir equipe"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {team.description && (
                  <CardDescription className="ml-5">{team.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {teamSpaces.map((s) => renderSpaceRow(s, canManage))}
                {teamSpaces.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">
                    Nenhum space nesta equipe ainda.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}

      </div>

      {/* New team dialog */}
      <Dialog open={newTeamOpen} onOpenChange={setNewTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova equipe</DialogTitle>
            <DialogDescription>Equipes agrupam spaces por área ou departamento.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitNewTeam();
            }}
            className="space-y-3"
          >
            <Label htmlFor="team-name">Nome</Label>
            <Input
              id="team-name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              autoFocus
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewTeamOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createTeam.isPending}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New space dialog */}
      <Dialog
        open={newSpaceTeamId !== undefined}
        onOpenChange={(v) => !v && setNewSpaceTeamId(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo space</DialogTitle>
            <DialogDescription>
              O space será criado dentro da equipe selecionada.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitNewSpace();
            }}
            className="space-y-3"
          >
            <Label htmlFor="space-name">Nome</Label>
            <Input
              id="space-name"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              autoFocus
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewSpaceTeamId(undefined)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createSpace.isPending}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "team"
                ? `Excluir equipe "${deleteTarget.team.name}"?`
                : `Excluir space "${deleteTarget?.kind === "space" ? deleteTarget.space.name : ""}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "team"
                ? "Todos os spaces, listas e tarefas vinculados a esta equipe serão removidos permanentemente. Esta ação não pode ser desfeita."
                : "Todas as listas e tarefas dentro deste space também serão removidas permanentemente. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
