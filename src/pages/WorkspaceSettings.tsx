import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRoleBasedAccess } from "@/hooks/useRoleBasedAccess";
import { ConvidarPessoa } from "@/components/ConvidarPessoa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function WorkspaceSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces, refresh } = useWorkspace();
  const { globalRole, canDeleteWorkspace } = useRoleBasedAccess();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const workspace = workspaces.find((ws) => ws.id === workspaceId);
  const [name, setName] = useState(workspace?.name ?? "");
  const [slug, setSlug] = useState(workspace?.slug ?? "");

  if (!workspace) {
    return <div className="p-6">Workspace não encontrado</div>;
  }

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ name, slug })
        .eq("id", workspaceId!);
      if (error) throw error;
      toast({ title: "Sucesso", description: "Workspace atualizado" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId!);
      if (error) throw error;
      toast({ title: "Sucesso", description: "Workspace deletado" });
      await refresh();
      navigate("/");
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Configurações do Workspace</h1>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Gerenciar Equipe</h2>
        <ConvidarPessoa workspaceId={workspace.id} onInviteSent={refresh} />
      </section>

      {canDeleteWorkspace ? (
        <section className="space-y-3 border-t border-destructive/30 pt-6">
          <h2 className="text-lg font-semibold text-destructive">Zona de Perigo</h2>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Deletar Workspace</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso vai deletar o workspace "{workspace.name}" e TODOS seus dados irreversivelmente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Deletar Definitivamente</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      ) : (
        <section className="space-y-2 border-t pt-6">
          <h2 className="text-lg font-semibold">Zona de Perigo</h2>
          <p className="text-sm text-muted-foreground">
            Apenas Admins e SuperAdmins podem deletar workspaces.
            {globalRole === "gestor" && " Como Gestor, você não pode deletar workspaces."}
          </p>
        </section>
      )}
    </div>
  );
}
