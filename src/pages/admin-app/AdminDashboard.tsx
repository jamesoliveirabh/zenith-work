import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ShieldCheck, Activity, AlertTriangle } from "lucide-react";

interface AuditRow {
  id: string;
  event: string;
  email: string | null;
  route: string | null;
  created_at: string;
}

export default function AdminDashboard() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("platform_admin_actions_log" as never)
        .select("id,event,email,route,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) {
        setRows((data as AuditRow[] | null) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo ao Backoffice</h1>
        <p className="text-sm text-muted-foreground">
          Painel global do dono da plataforma — Fase P0 (estrutura base).
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sessão administrativa ativa e isolada do app cliente.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Auditoria
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Login, logout e acessos negados ficam em <code>platform_admin_actions_log</code>.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Próximas fases
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Métricas globais, contas, billing e operações entram nas fases P1+.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
          <CardDescription>Últimas 20 entradas do log global.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>
          ) : (
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-2 flex items-center gap-3">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">{r.event}</span>
                  <span className="flex-1 truncate">{r.email ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">{r.route ?? ""}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {format(new Date(r.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
