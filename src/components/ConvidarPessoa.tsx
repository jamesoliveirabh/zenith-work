import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleBasedAccess } from "@/hooks/useRoleBasedAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Props {
  workspaceId: string;
  onInviteSent?: () => void;
}

export function ConvidarPessoa({ workspaceId, onInviteSent }: Props) {
  const { user } = useAuth();
  const { globalRole } = useRoleBasedAccess();
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const availableRoles = (() => {
    if (globalRole === "superadmin")
      return [
        { value: "admin", label: "Admin" },
        { value: "gestor", label: "Gestor" },
        { value: "member", label: "Member" },
        { value: "guest", label: "Convidado" },
      ];
    if (globalRole === "admin")
      return [
        { value: "gestor", label: "Gestor" },
        { value: "member", label: "Member" },
        { value: "guest", label: "Convidado" },
      ];
    if (globalRole === "gestor")
      return [
        { value: "member", label: "Member" },
        { value: "guest", label: "Convidado" },
      ];
    return [];
  })();

  const roleDescriptions: Record<string, string> = {
    admin: "Gerencia equipe, membros e configurações do workspace",
    gestor: "Gerencia tarefas e projetos, pode convidar members",
    member: "Trabalha com tarefas",
    guest: "Acesso read-only ao workspace",
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || availableRoles.length === 0) return;

    setLoading(true);
    try {
      // Look up target user by email
      const { data: target, error: lookupErr } = await (supabase as any)
        .from("users")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!target?.id) throw new Error("Usuário não encontrado com este e-mail");

      const { error } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspaceId,
          user_id: target.id,
          role: selectedRole as any,
          invited_by: user.id,
          status: "pending",
        } as any);

      if (error) throw error;

      toast({ title: "Sucesso", description: `Convite enviado para ${email} como ${selectedRole}` });
      setEmail("");
      setSelectedRole("member");
      onInviteSent?.();
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível enviar o convite",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (availableRoles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Você não tem permissão para convidar membros.
      </p>
    );
  }

  return (
    <form onSubmit={handleInvite} className="space-y-3">
      <h3 className="text-sm font-semibold">Convidar pessoa</h3>
      <Input
        type="email"
        placeholder="email@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={loading}
      />
      <Select value={selectedRole} onValueChange={setSelectedRole} disabled={loading}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {availableRoles.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {roleDescriptions[selectedRole] ?? ""}
      </p>
      <Button type="submit" disabled={loading || !email}>
        {loading ? "Enviando..." : "Enviar convite"}
      </Button>
    </form>
  );
}
