import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Shield, Users, Lock, Activity, KeyRound, ShieldCheck, AlertCircle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ListRow { id: string; name: string; restricted: boolean; }

const actionLabels: Record<string, string> = {
  "member.added": "Membro adicionado",
  "member.removed": "Membro removido",
  "member.invited": "Convite enviado",
  "role.changed": "Papel alterado",
  "invitation.accepted": "Convite aceito",
  "invitation.revoked": "Convite revogado",
  "list.created": "Lista criada",
  "list.deleted": "Lista excluída",
  "permission.granted": "Permissão concedida",
  "permission.changed": "Permissão alterada",
  "permission.revoked": "Permissão revogada",
};

const actionColor = (a: string) => {
  if (a.includes("removed") || a.includes("deleted") || a.includes("revoked")) return "destructive";
  if (a.includes("changed")) return "secondary";
  return "default";
};

export default function Security() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [memberCount, setMemberCount] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);

  useEffect(() => {
    const check = async () => {
      if (!current || !user) return;
      const { data } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", current.id)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsAdmin(data?.role === "admin");
    };
    check();
  }, [current?.id, user?.id]);

  useEffect(() => {
    const load = async () => {
      if (!current || !isAdmin) return;
      const [{ data: l }, { data: ls }, { count: mc }, { count: pc }] = await Promise.all([
        supabase.from("audit_logs").select("*").eq("workspace_id", current.id)
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("lists").select("id,name").eq("workspace_id", current.id).order("name"),
        supabase.from("workspace_members").select("*", { count: "exact", head: true }).eq("workspace_id", current.id),
        supabase.from("workspace_invitations").select("*", { count: "exact", head: true })
          .eq("workspace_id", current.id).eq("status", "pending"),
      ]);
      setLogs((l as AuditRow[]) ?? []);
      setMemberCount(mc ?? 0);
      setPendingInvites(pc ?? 0);

      // determine restricted state
      if (ls && ls.length) {
        const { data: perms } = await supabase
          .from("list_permissions").select("list_id")
          .in("list_id", ls.map((x) => x.id));
        const restrictedSet = new Set((perms ?? []).map((p) => p.list_id));
        setLists(ls.map((x) => ({ ...x, restricted: restrictedSet.has(x.id) })));
      } else {
        setLists([]);
      }
    };
    load();
  }, [current?.id, isAdmin]);

  if (isAdmin === null) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Acesso restrito</CardTitle>
            </div>
            <CardDescription>
              Apenas administradores do workspace podem acessar o módulo de Segurança.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== "all" && !log.action.startsWith(actionFilter)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (log.actor_email ?? "").toLowerCase().includes(s) ||
             log.action.toLowerCase().includes(s) ||
             JSON.stringify(log.metadata).toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Segurança</h1>
          <p className="text-sm text-muted-foreground">Auditoria, permissões e gestão de pessoas</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Membros</CardDescription>
            <CardTitle className="text-3xl">{memberCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Convites pendentes</CardDescription>
            <CardTitle className="text-3xl">{pendingInvites}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Listas privadas</CardDescription>
            <CardTitle className="text-3xl">{lists.filter((l) => l.restricted).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Eventos (200)</CardDescription>
            <CardTitle className="text-3xl">{logs.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-2" /> Logs de auditoria</TabsTrigger>
          <TabsTrigger value="lists"><Lock className="h-4 w-4 mr-2" /> Permissões de listas</TabsTrigger>
          <TabsTrigger value="policies"><ShieldCheck className="h-4 w-4 mr-2" /> Políticas</TabsTrigger>
        </TabsList>

        {/* AUDIT */}
        <TabsContent value="audit" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar por email, ação ou dados…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="member">Membros</SelectItem>
                <SelectItem value="invitation">Convites</SelectItem>
                <SelectItem value="role">Papéis</SelectItem>
                <SelectItem value="list">Listas</SelectItem>
                <SelectItem value="permission">Permissões</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{log.actor_email ?? "Sistema"}</TableCell>
                    <TableCell>
                      <Badge variant={actionColor(log.action) as never}>
                        {actionLabels[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono max-w-md truncate">
                      {Object.keys(log.metadata).length ? JSON.stringify(log.metadata) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum evento registrado
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* LISTS */}
        <TabsContent value="lists" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Privacidade das listas</CardTitle>
              <CardDescription>
                Listas sem permissões definidas são acessíveis a todos os membros do workspace.
                Adicione permissões para torná-las privadas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lista</TableHead>
                    <TableHead>Visibilidade</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>
                        {l.restricted
                          ? <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" /> Restrita</Badge>
                          : <Badge variant="outline">Workspace</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/security/lists/${l.id}`}>
                            Gerenciar <ExternalLink className="h-3 w-3 ml-1.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {lists.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                      Nenhuma lista
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* POLICIES */}
        <TabsContent value="policies" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Verificação de senha vazada</CardTitle>
                  <Badge>Ativo</Badge>
                </div>
                <CardDescription>
                  Senhas comprometidas (HaveIBeenPwned) são bloqueadas no cadastro e na alteração.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Row-Level Security</CardTitle>
                  <Badge>Ativo</Badge>
                </div>
                <CardDescription>
                  Toda tabela de dados aplica políticas RLS por workspace e usuário.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Auditoria automática</CardTitle>
                  <Badge>Ativo</Badge>
                </div>
                <CardDescription>
                  Triggers gravam ações sensíveis (membros, convites, listas, permissões).
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Confirmação de email</CardTitle>
                  <Badge variant="outline">Auto</Badge>
                </div>
                <CardDescription>
                  Cadastros confirmados automaticamente. Ajuste em caso de exigência regulatória.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
