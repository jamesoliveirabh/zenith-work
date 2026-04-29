import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Lock, LockOpen, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Access = "view" | "edit" | "admin";

interface Permission {
  id: string;
  user_id: string;
  access_level: Access;
  profile?: { display_name: string | null; email: string | null; avatar_url: string | null };
}

interface Member {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export default function ListPermissions() {
  const { listId } = useParams();
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [listName, setListName] = useState("");
  const [perms, setPerms] = useState<Permission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pickUser, setPickUser] = useState<string>("");
  const [pickAccess, setPickAccess] = useState<Access>("view");

  useEffect(() => {
    const init = async () => {
      if (!current || !user || !listId) return;
      const { data: m } = await supabase.from("workspace_members")
        .select("role").eq("workspace_id", current.id).eq("user_id", user.id).maybeSingle();
      setIsAdmin(m?.role === "admin");

      const { data: list } = await supabase.from("lists")
        .select("name").eq("id", listId).maybeSingle();
      setListName(list?.name ?? "Lista");
      await loadAll();
    };
    init();
    // eslint-disable-next-line
  }, [current?.id, user?.id, listId]);

  const loadAll = async () => {
    if (!current || !listId) return;
    const { data: ms } = await supabase.from("workspace_members")
      .select("user_id").eq("workspace_id", current.id);
    const ids = (ms ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,display_name,email,avatar_url").in("id", ids)
      : { data: [] as Member[] };
    setMembers((profs ?? []).map((p) => ({
      user_id: p.id, display_name: p.display_name, email: p.email, avatar_url: p.avatar_url,
    })));

    const { data: ps } = await supabase.from("list_permissions")
      .select("id,user_id,access_level").eq("list_id", listId);
    const userIds = (ps ?? []).map((p) => p.user_id);
    const { data: pProfs } = userIds.length
      ? await supabase.from("profiles").select("id,display_name,email,avatar_url").in("id", userIds)
      : { data: [] };
    setPerms((ps ?? []).map((p) => ({
      ...p,
      access_level: p.access_level as Access,
      profile: pProfs?.find((pp) => pp.id === p.user_id),
    })));
  };

  const handleAdd = async () => {
    if (!current || !listId || !pickUser) return;
    const { error } = await supabase.from("list_permissions").insert({
      workspace_id: current.id, list_id: listId, user_id: pickUser,
      access_level: pickAccess, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Permissão concedida");
    setPickUser("");
    loadAll();
  };

  const handleChange = async (id: string, level: Access) => {
    const { error } = await supabase.from("list_permissions")
      .update({ access_level: level }).eq("id", id);
    if (error) return toast.error(error.message);
    loadAll();
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("list_permissions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Permissão removida");
    loadAll();
  };

  const handleMakePublic = async () => {
    if (!listId) return;
    if (!confirm("Tornar lista pública removerá todas as permissões. Continuar?")) return;
    const { error } = await supabase.from("list_permissions").delete().eq("list_id", listId);
    if (error) return toast.error(error.message);
    toast.success("Lista agora é acessível a todo o workspace");
    loadAll();
  };

  const restricted = perms.length > 0;
  const availableMembers = members.filter((m) => !perms.find((p) => p.user_id === m.user_id));

  if (isAdmin === false) {
    return <div className="p-8 text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/security"><ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar</Link>
      </Button>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {restricted ? <Lock className="h-5 w-5 text-primary" /> : <LockOpen className="h-5 w-5 text-muted-foreground" />}
            <h1 className="text-2xl font-bold">{listName}</h1>
            <Badge variant={restricted ? "secondary" : "outline"}>
              {restricted ? "Restrita" : "Workspace"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {restricted
              ? "Apenas usuários abaixo (e administradores) têm acesso."
              : "Todos os membros do workspace têm acesso. Adicione um usuário para tornar privada."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/security/lists/${listId}/roles`}>
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Sobrepor regras por papel
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Conceder acesso
          </CardTitle>
          <CardDescription>Escolha o usuário e o nível de permissão.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={pickUser} onValueChange={setPickUser}>
            <SelectTrigger className="min-w-[260px] flex-1"><SelectValue placeholder="Selecionar usuário…" /></SelectTrigger>
            <SelectContent>
              {availableMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.display_name ?? m.email ?? m.user_id}
                </SelectItem>
              ))}
              {availableMembers.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">Todos os membros já têm acesso</div>
              )}
            </SelectContent>
          </Select>
          <Select value={pickAccess} onValueChange={(v) => setPickAccess(v as Access)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="view">Visualizar</SelectItem>
              <SelectItem value="edit">Editar</SelectItem>
              <SelectItem value="admin">Admin da lista</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={!pickUser}>Adicionar</Button>
          {restricted && (
            <Button variant="outline" onClick={handleMakePublic}>
              Tornar pública
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Acessos concedidos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead className="w-40">Nível</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perms.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {(p.profile?.display_name ?? p.profile?.email ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">{p.profile?.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.profile?.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={p.access_level} onValueChange={(v) => handleChange(p.id, v as Access)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">Visualizar</SelectItem>
                        <SelectItem value="edit">Editar</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => handleRemove(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {perms.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                  Lista pública — todos os membros do workspace têm acesso
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
