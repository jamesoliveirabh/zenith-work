import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock, RotateCcw, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Role = "admin" | "member" | "member_limited" | "guest";

interface CatalogRow {
  key: string; category: string; label: string; description: string; position: number;
}
interface WsPerm { role: Role; permission_key: string; enabled: boolean; }
interface ListPerm { id: string; role: Role; permission_key: string; enabled: boolean; }

const ROLES: { key: Role; label: string }[] = [
  { key: "guest",          label: "Convidado" },
  { key: "member_limited", label: "Membro limitado" },
  { key: "member",         label: "Membro" },
  { key: "admin",          label: "Administrador" },
];

export default function ListRolePermissions() {
  const { listId } = useParams();
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [listName, setListName] = useState("");
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [wsPerms, setWsPerms] = useState<WsPerm[]>([]);
  const [overrides, setOverrides] = useState<ListPerm[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!current || !user || !listId) return;
      const { data: m } = await supabase.from("workspace_members")
        .select("role").eq("workspace_id", current.id).eq("user_id", user.id).maybeSingle();
      setIsAdmin(m?.role === "admin");
      const { data: l } = await supabase.from("lists").select("name").eq("id", listId).maybeSingle();
      setListName(l?.name ?? "Lista");
    };
    init();
  }, [current?.id, user?.id, listId]);

  const load = async () => {
    if (!current || !listId) return;
    const [{ data: cat }, { data: rp }, { data: ov }] = await Promise.all([
      supabase.from("permission_catalog").select("*").order("position"),
      supabase.from("role_permissions").select("role,permission_key,enabled").eq("workspace_id", current.id),
      supabase.from("list_role_permissions").select("id,role,permission_key,enabled").eq("list_id", listId),
    ]);
    setCatalog((cat as CatalogRow[]) ?? []);
    setWsPerms((rp as WsPerm[]) ?? []);
    setOverrides((ov as ListPerm[]) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id, listId, isAdmin]);

  const grouped = useMemo(() => {
    const map: Record<string, CatalogRow[]> = {};
    for (const c of catalog) (map[c.category] ||= []).push(c);
    return map;
  }, [catalog]);

  const wsValue = (role: Role, key: string) =>
    wsPerms.find((p) => p.role === role && p.permission_key === key)?.enabled ?? false;

  const overrideOf = (role: Role, key: string) =>
    overrides.find((p) => p.role === role && p.permission_key === key);

  const effective = (role: Role, key: string) => {
    if (role === "admin") return true;
    const ov = overrideOf(role, key);
    return ov ? ov.enabled : wsValue(role, key);
  };

  const toggle = async (role: Role, key: string, value: boolean) => {
    if (!current || !listId) return;
    const cellId = `${role}:${key}`;
    setSaving(cellId);
    const ov = overrideOf(role, key);
    const wsDefault = wsValue(role, key);

    // If new value matches workspace default, remove the override
    if (value === wsDefault && ov) {
      const { error } = await supabase.from("list_role_permissions").delete().eq("id", ov.id);
      if (error) toast.error(error.message);
      else setOverrides((o) => o.filter((x) => x.id !== ov.id));
    } else if (ov) {
      const { error } = await supabase.from("list_role_permissions")
        .update({ enabled: value, updated_by: user?.id }).eq("id", ov.id);
      if (error) toast.error(error.message);
      else setOverrides((o) => o.map((x) => x.id === ov.id ? { ...x, enabled: value } : x));
    } else if (value !== wsDefault) {
      const { data, error } = await supabase.from("list_role_permissions").insert({
        workspace_id: current.id, list_id: listId, role, permission_key: key,
        enabled: value, updated_by: user?.id,
      }).select("id,role,permission_key,enabled").single();
      if (error) toast.error(error.message);
      else if (data) setOverrides((o) => [...o, data as ListPerm]);
    }
    setSaving(null);
  };

  const handleResetAll = async () => {
    if (!listId) return;
    if (!confirm("Remover todas as sobreposições desta lista? As regras voltam a seguir o workspace.")) return;
    const { error } = await supabase.from("list_role_permissions").delete().eq("list_id", listId);
    if (error) return toast.error(error.message);
    toast.success("Sobreposições removidas");
    setOverrides([]);
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

  const overrideCount = overrides.length;

  return (
    <div className="p-6 max-w-[1400px] space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/security"><ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar</Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Permissões da lista · {listName}</h1>
            <p className="text-sm text-muted-foreground">
              Sobreponha as regras do workspace para esta lista específica.
              {overrideCount > 0 && (
                <Badge variant="secondary" className="ml-2">{overrideCount} sobreposição(ões) ativas</Badge>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetAll} disabled={overrideCount === 0}>
          <RotateCcw className="h-4 w-4 mr-2" /> Limpar sobreposições
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
                        const locked = r.key === "admin";
                        const value = effective(r.key, perm.key);
                        const isOverride = !!overrideOf(r.key, perm.key);
                        return (
                          <td key={r.key} className="p-4 text-center align-middle">
                            <div className="flex flex-col items-center gap-1">
                              <Switch
                                checked={locked ? true : value}
                                disabled={locked || saving === cellId}
                                onCheckedChange={(v) => toggle(r.key, perm.key, v)}
                              />
                              {!locked && (
                                <span className={`text-[10px] uppercase tracking-wide ${isOverride ? "text-primary font-semibold" : "text-muted-foreground/60"}`}>
                                  {isOverride ? "Sobreposto" : "Workspace"}
                                </span>
                              )}
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

      <div className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/20">
        <strong>Como funciona:</strong> alternar um switch cria uma <em>sobreposição</em> apenas para esta lista.
        Voltar ao valor padrão do workspace remove a sobreposição automaticamente.
        Administradores sempre têm acesso total.
      </div>
    </div>
  );
}
