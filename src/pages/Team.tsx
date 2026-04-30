import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { z } from "zod";

type Role = "admin" | "member" | "member_limited" | "guest";
type OrgRole = "admin" | "gestor" | "member";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  org_role: OrgRole;
  profile?: { display_name: string | null; email: string | null; avatar_url: string | null };
}
interface Invitation {
  id: string;
  email: string;
  role: Role;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
}

const inviteSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  role: z.enum(["admin", "member", "member_limited", "guest"]),
});

export default function Team() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [loading, setLoading] = useState(false);
  const [myRole, setMyRole] = useState<Role | null>(null);

  const isAdmin = myRole === "admin";

  const load = async () => {
    if (!current) return;
    const [{ data: mems }, { data: invs }] = await Promise.all([
      supabase.from("workspace_members")
        .select("id, user_id, role, org_role")
        .eq("workspace_id", current.id),
      supabase.from("workspace_invitations")
        .select("id, email, role, token, status, expires_at, created_at")
        .eq("workspace_id", current.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (mems && mems.length) {
      const ids = mems.map((m) => m.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", ids);
      const merged = mems.map((m) => ({
        ...m,
        profile: profs?.find((p) => p.id === m.user_id) ?? undefined,
      })) as Member[];
      setMembers(merged);
      setMyRole(merged.find((m) => m.user_id === user?.id)?.role ?? null);
    } else {
      setMembers([]);
    }
    setInvitations((invs as Invitation[]) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !user) return;
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("workspace_invitations").insert({
      workspace_id: current.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      invited_by: user.id,
    }).select("token").single();
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Já existe um convite pendente para este email" : error.message);
      return;
    }
    const link = `${window.location.origin}/invite/${data.token}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Convite criado — link copiado para a área de transferência");
    setEmail("");
    load();
  };

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from("workspace_invitations")
      .update({ status: "revoked" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Convite revogado");
    load();
  };

  const updateMemberRole = async (memberId: string, newRole: Role) => {
    const { error } = await supabase.from("workspace_members")
      .update({ role: newRole }).eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Papel atualizado");
    load();
  };

  const updateMemberOrgRole = async (memberId: string, newOrgRole: OrgRole) => {
    const { error } = await supabase.from("workspace_members")
      .update({ org_role: newOrgRole }).eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Papel organizacional atualizado");
    load();
  };

  const orgBadgeProps = (r: OrgRole): { variant: "destructive" | "secondary" | "outline"; className: string } => {
    if (r === "admin") return { variant: "destructive", className: "" };
    if (r === "gestor")
      return {
        variant: "secondary",
        className: "bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300",
      };
    return { variant: "outline", className: "" };
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("Remover este membro do workspace?")) return;
    const { error } = await supabase.from("workspace_members").delete().eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Membro removido");
    load();
  };

  if (!current) return null;

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie quem tem acesso ao workspace <strong>{current.name}</strong>
        </p>
      </div>

      {isAdmin && (
        <form onSubmit={handleInvite} className="rounded-lg border p-4 space-y-3 bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4" /> Convidar pessoa
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2">
            <div>
              <Label htmlFor="invite-email" className="sr-only">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="email@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="member">Membro</SelectItem>
                <SelectItem value="member_limited">Membro limitado</SelectItem>
                <SelectItem value="guest">Convidado</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={loading}>
              <Mail className="h-4 w-4" /> Enviar convite
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Após criar, o link do convite é copiado para sua área de transferência. Compartilhe com a pessoa.
          </p>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Membros ({members.length})
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Papel organizacional</TableHead>
                <TableHead>Papel de workspace</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {(m.profile?.display_name ?? m.profile?.email ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {m.profile?.display_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                          {m.user_id === user?.id && (
                            <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{m.profile?.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin && m.user_id !== user?.id ? (
                      <Select value={m.role} onValueChange={(v) => updateMemberRole(m.id, v as Role)}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="member">Membro</SelectItem>
                          <SelectItem value="member_limited">Membro limitado</SelectItem>
                          <SelectItem value="guest">Convidado</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{m.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin && m.user_id !== user?.id && (
                      <Button variant="ghost" size="icon" onClick={() => removeMember(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {isAdmin && invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Convites pendentes ({invitations.length})
          </h2>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell><Badge variant="secondary">{inv.role}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => copyLink(inv.token)} title="Copiar link">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => revokeInvite(inv.id)} title="Revogar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
