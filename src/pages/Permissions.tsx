import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertCircle, RotateCcw, Lock, Info } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Role = "admin" | "gestor" | "member" | "member_limited" | "guest";

interface CatalogRow {
  key: string; category: string; label: string; description: string; position: number;
}
interface PermRow {
  id: string; role: Role; permission_key: string; enabled: boolean;
}

// Order shown in the matrix (lowest -> highest power), matches the reference UI
const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "guest",           label: "Convidado",       description: "Acesso restrito (clientes / stakeholders externos)" },
  { key: "member_limited",  label: "Membro limitado", description: "Colabora em tarefas, sem alterar configurações" },
  { key: "member",          label: "Membro",          description: "Acessa apenas os spaces e listas aos quais foi adicionado" },
  { key: "gestor",          label: "Gestor",          description: "Cria e gerencia equipes e spaces, adiciona membros às suas equipes" },
  { key: "admin",           label: "Administrador",   description: "Controle total da organização, configurações globais. Sempre habilitado." },
];

export default function Permissions() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!current || !user) return;
      const { data: m } = await supabase.from("workspace_members")
        .select("role").eq("workspace_id", current.id).eq("user_id", user.id).maybeSingle();
      setIsAdmin(m?.role === "admin");
    };
    init();
  }, [current?.id, user?.id]);

  const load = async () => {
    if (!current) return;
    const [{ data: cat }, { data: rp }] = await Promise.all([
      supabase.from("permission_catalog").select("*").order("position"),
      supabase.from("role_permissions").select("id,role,permission_key,enabled")
        .eq("workspace_id", current.id),
    ]);
    setCatalog((cat as CatalogRow[]) ?? []);
    setPerms((rp as PermRow[]) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id, isAdmin]);

  const grouped = useMemo(() => {
    const map: Record<string, CatalogRow[]> = {};
    for (const c of catalog) (map[c.category] ||= []).push(c);
    return map;
  }, [catalog]);

  const isEnabled = (role: Role, key: string) =>
    perms.find((p) => p.role === role && p.permission_key === key)?.enabled ?? false;

  const toggle = async (role: Role, key: string, value: boolean) => {
    if (!current) return;
    const cellId = `${role}:${key}`;
    setSaving(cellId);
    const existing = perms.find((p) => p.role === role && p.permission_key === key);
    if (existing) {
      const { error } = await supabase.from("role_permissions")
        .update({ enabled: value, updated_by: user?.id }).eq("id", existing.id);
      if (error) toast.error(error.message);
      else setPerms((p) => p.map((x) => x.id === existing.id ? { ...x, enabled: value } : x));
    } else {
      const { data, error } = await supabase.from("role_permissions").insert({
        workspace_id: current.id, role, permission_key: key, enabled: value, updated_by: user?.id,
      }).select("id,role,permission_key,enabled").single();
      if (error) toast.error(error.message);
      else if (data) setPerms((p) => [...p, data as PermRow]);
    }
    setSaving(null);
  };

  const handleResetDefaults = async () => {
    if (!current) return;
    if (!confirm("Restaurar permissões padrão para todos os papéis? As configurações atuais serão sobrescritas.")) return;
    const { error: delErr } = await supabase.from("role_permissions")
      .delete().eq("workspace_id", current.id);
    if (delErr) return toast.error(delErr.message);
    const { error: rpcErr } = await supabase.rpc("seed_role_permissions", { _ws: current.id });
    if (rpcErr) return toast.error(rpcErr.message);
    toast.success("Padrões restaurados");
    load();
  };

  if (isAdmin === null) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Acesso restrito</CardTitle>
            </div>
            <CardDescription>Apenas administradores podem gerenciar permissões.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Permissões por papel</h1>
            <p className="text-sm text-muted-foreground">
              Configure o que cada nível de usuário pode fazer no workspace.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetDefaults}>
          <RotateCcw className="h-4 w-4 mr-2" /> Restaurar padrões
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="text-left p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground w-1/3 min-w-[300px]">
                  Ações
                </th>
                {ROLES.map((r) => (
                  <th key={r.key} className="p-4 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-[140px]">
                    <div className="flex flex-col items-center gap-1">
                      <span>{r.label}</span>
                      {r.key === "admin" && <Lock className="h-3 w-3 opacity-50" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([category, items]) => (
                <>
                  <tr key={`cat-${category}`} className="bg-muted/20 border-b">
                    <td colSpan={ROLES.length + 1} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {category}
                    </td>
                  </tr>
                  {items.map((perm) => (
                    <tr key={perm.key} className="border-b hover:bg-muted/10 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-medium text-sm">{perm.label}</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{perm.description}</p>
                      </td>
                      {ROLES.map((r) => {
                        const cellId = `${r.key}:${perm.key}`;
                        const enabled = isEnabled(r.key, perm.key);
                        const locked = r.key === "admin";
                        return (
                          <td key={r.key} className="p-4 text-center align-middle">
                            <div className="flex justify-center">
                              <Switch
                                checked={locked ? true : enabled}
                                disabled={locked || saving === cellId}
                                onCheckedChange={(v) => toggle(r.key, perm.key, v)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4 text-xs text-muted-foreground">
        {ROLES.map((r) => (
          <div key={r.key} className="flex items-start gap-2 p-3 rounded-lg border bg-card">
            <Badge variant={r.key === "admin" ? "destructive" : r.key === "guest" ? "outline" : "secondary"} className="shrink-0">
              {r.label}
            </Badge>
            <span className="leading-relaxed">{r.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
