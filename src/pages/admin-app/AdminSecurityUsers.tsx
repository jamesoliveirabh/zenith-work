import { useState } from "react";
import { ShieldCheck, ShieldOff, UserPlus, Power, PowerOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdminActionDialog } from "@/components/admin/billing/AdminActionDialog";
import {
  useAdminUsers, useGrantRole, useRevokeRole, useSetDisabled,
  usePlatformSettings, useSetMfaEnforcement,
} from "@/hooks/admin/useSecurity";
import type { PlatformRole } from "@/lib/admin/securityService";
import { formatDateTime } from "@/lib/billing/format";
import { supabase } from "@/integrations/supabase/client";

const ALL_ROLES: PlatformRole[] = [
  "platform_owner", "finance_admin", "support_admin", "security_admin",
];

type DialogState = null
  | { kind: "grant" }
  | { kind: "revoke"; userId: string; role: PlatformRole; email: string | null }
  | { kind: "toggle"; userId: string; disable: boolean; email: string | null }
  | { kind: "mfa"; nextValue: boolean }
  | { kind: "password"; userId: string; email: string | null };

export default function AdminSecurityUsers() {
  const { data: admins = [], isLoading } = useAdminUsers();
  const { data: settings } = usePlatformSettings();
  const grant = useGrantRole();
  const revoke = useRevokeRole();
  const toggle = useSetDisabled();
  const mfa = useSetMfaEnforcement();

  const [dialog, setDialog] = useState<DialogState>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRoleVal, setGrantRoleVal] = useState<PlatformRole>("support_admin");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admins internos</h1>
          <p className="text-sm text-muted-foreground">
            Gestão de papéis (RBAC) e enforcement de MFA para o backoffice.
          </p>
        </div>
        <Button onClick={() => { setGrantEmail(""); setGrantRoleVal("support_admin"); setDialog({ kind: "grant" }); }}>
          <UserPlus className="h-4 w-4 mr-1.5" /> Conceder papel
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {settings?.mfa_enforcement_enabled ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
            Enforcement de MFA
          </CardTitle>
          <CardDescription>
            Quando ativo, admins sem MFA configurado são bloqueados no login.
            Em modo desativado, a obrigatoriedade fica apenas registrada por usuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            checked={!!settings?.mfa_enforcement_enabled}
            onCheckedChange={(v) => setDialog({ kind: "mfa", nextValue: v })}
          />
          <span className="text-sm text-muted-foreground">
            {settings?.mfa_enforcement_enabled ? "Ativo (rollout)" : "Desativado (warn-only)"}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Papéis</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última sessão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : admins.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum admin cadastrado.</TableCell></TableRow>
              ) : admins.map((a) => (
                <TableRow key={a.user_id}>
                  <TableCell>
                    <div className="font-medium">{a.display_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {a.roles.length === 0
                      ? <span className="text-xs text-muted-foreground">sem papel ativo</span>
                      : a.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs">
                          {r}
                          <button
                            className="ml-1 opacity-60 hover:opacity-100"
                            onClick={() => setDialog({ kind: "revoke", userId: a.user_id, role: r as PlatformRole, email: a.email })}
                            aria-label="Revogar"
                          >×</button>
                        </Badge>
                      ))
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.mfa_required ? "default" : "outline"} className="text-xs">
                      {a.mfa_required ? "obrigatório" : "opcional"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.is_disabled
                      ? <Badge variant="destructive">desativado</Badge>
                      : <Badge variant="outline">ativo</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(a.last_seen_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: "toggle", userId: a.user_id, disable: !a.is_disabled, email: a.email })}
                    >
                      {a.is_disabled
                        ? <><Power className="h-4 w-4 mr-1" /> Reativar</>
                        : <><PowerOff className="h-4 w-4 mr-1" /> Desativar</>}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Grant role */}
      <AdminActionDialog
        open={dialog?.kind === "grant"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Conceder papel a um usuário"
        description="O usuário precisa já existir no sistema. Use o email para localizá-lo."
        confirmLabel="Conceder"
        loading={grant.isPending}
        onConfirm={async (reason) => {
          // Look up profile by email
          const { data, error } = await supabase
            .from("profiles").select("id").eq("email", grantEmail.trim()).maybeSingle();
          if (error || !data) {
            throw new Error("Usuário não encontrado para esse email");
          }
          await grant.mutateAsync({ userId: data.id, role: grantRoleVal, reason });
          setDialog(null);
        }}
      >
        <div className="space-y-2">
          <Label>Email do usuário</Label>
          <Input value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="user@empresa.com" />
        </div>
        <div className="space-y-2">
          <Label>Papel</Label>
          <Select value={grantRoleVal} onValueChange={(v) => setGrantRoleVal(v as PlatformRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </AdminActionDialog>

      {/* Revoke role */}
      <AdminActionDialog
        open={dialog?.kind === "revoke"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "revoke" ? `Revogar ${dialog.role}` : "Revogar papel"}
        description={dialog?.kind === "revoke" ? `Usuário: ${dialog.email ?? "—"}` : ""}
        confirmLabel="Revogar"
        destructive
        loading={revoke.isPending}
        onConfirm={async (reason) => {
          if (dialog?.kind !== "revoke") return;
          await revoke.mutateAsync({ userId: dialog.userId, role: dialog.role, reason });
          setDialog(null);
        }}
      />

      {/* Disable / enable */}
      <AdminActionDialog
        open={dialog?.kind === "toggle"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "toggle" ? (dialog.disable ? "Desativar admin" : "Reativar admin") : ""}
        description={dialog?.kind === "toggle" ? `Usuário: ${dialog.email ?? "—"}` : ""}
        confirmLabel={dialog?.kind === "toggle" && dialog.disable ? "Desativar" : "Reativar"}
        destructive={dialog?.kind === "toggle" && dialog.disable}
        loading={toggle.isPending}
        onConfirm={async (reason) => {
          if (dialog?.kind !== "toggle") return;
          await toggle.mutateAsync({ userId: dialog.userId, disabled: dialog.disable, reason });
          setDialog(null);
        }}
      />

      {/* MFA toggle */}
      <AdminActionDialog
        open={dialog?.kind === "mfa"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "mfa" ? (dialog.nextValue ? "Ativar enforcement de MFA" : "Desativar enforcement de MFA") : ""}
        description="Esta mudança afeta todos os admins do backoffice."
        confirmLabel="Aplicar"
        destructive={dialog?.kind === "mfa" && !dialog.nextValue}
        loading={mfa.isPending}
        onConfirm={async (reason) => {
          if (dialog?.kind !== "mfa") return;
          await mfa.mutateAsync({ enabled: dialog.nextValue, reason });
          setDialog(null);
        }}
      />
    </div>
  );
}
