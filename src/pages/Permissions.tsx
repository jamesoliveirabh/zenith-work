import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, AlertCircle, RotateCcw, Shield, Users, Settings2, ListTodo, Database } from "lucide-react";
import { toast } from "sonner";

type Role = "admin" | "member" | "guest";

interface CatalogRow {
  key: string; category: string; label: string; description: string; position: number;
}
interface PermRow {
  id: string; role: Role; permission_key: string; enabled: boolean;
}

const roleMeta: Record<Role, { label: string; description: string; tone: string }> = {
  admin:  { label: "Admin",     description: "Acesso total. Não editável.", tone: "destructive" },
  member: { label: "Membro",    description: "Colaboradores que executam o trabalho diário.", tone: "default" },
  guest:  { label: "Convidado", description: "Acesso restrito, normalmente clientes ou stakeholders externos.", tone: "secondary" },
};

const categoryIcon: Record<string, JSX.Element> = {
  "Administração": <Shield className="h-4 w-4" />,
  "Configuração": <Settings2 className="h-4 w-4" />,
  "Tarefas": <ListTodo className="h-4 w-4" />,
  "Dados": <Database className="h-4 w-4" />,
};

export default function Permissions() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [activeRole, setActiveRole] = useState<Role>("member");
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
    setSaving(`${role}:${key}`);
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
    if (!confirm("Restaurar permissões padrão para todos os papéis? Isso sobrescreverá as configurações atuais.")) return;
    // Delete all and re-seed
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

  const lockedRole = activeRole === "admin";

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Permissões por papel</h1>
            <p className="text-sm text-muted-foreground">
              Defina o que cada papel pode fazer no workspace.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetDefaults}>
          <RotateCcw className="h-4 w-4 mr-2" /> Restaurar padrões
        </Button>
      </div>

      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as Role)}>
        <TabsList>
          {(["admin","member","guest"] as Role[]).map((r) => (
            <TabsTrigger key={r} value={r} className="gap-2">
              <Users className="h-3.5 w-3.5" />
              {roleMeta[r].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(["admin","member","guest"] as Role[]).map((r) => (
          <TabsContent key={r} value={r} className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{roleMeta[r].label}</CardTitle>
                    <CardDescription>{roleMeta[r].description}</CardDescription>
                  </div>
                  {r === "admin" && <Badge variant="destructive">Travado</Badge>}
                </div>
              </CardHeader>
            </Card>

            {Object.entries(grouped).map(([category, items]) => (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    {categoryIcon[category]}
                    <span>{category}</span>
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-border -mt-2">
                  {items.map((perm) => {
                    const enabled = isEnabled(r, perm.key);
                    const key = `${r}:${perm.key}`;
                    return (
                      <div key={perm.key} className="py-4 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{perm.label}</div>
                          <p className="text-sm text-muted-foreground mt-1">{perm.description}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          disabled={lockedRole || saving === key}
                          onCheckedChange={(v) => toggle(r, perm.key, v)}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
