import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSlackIntegration } from "@/hooks/useWorkspaceIntegrations";
import { useSlackChannels } from "@/hooks/useSlackChannels";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, RefreshCw, Trash2, ExternalLink, Lock, Hash } from "lucide-react";

function SlackIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M5 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 4 0v5a2 2 0 0 1-4 0v-5zM9 5a2 2 0 1 1 2-2v2H9zm0 1a2 2 0 1 1 0 4H4a2 2 0 0 1 0-4h5zm10 3a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 1 1-4 0V4a2 2 0 0 1 4 0v5zm-3 10a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 1 1 0-4h5a2 2 0 0 1 0 4h-5z" />
    </svg>
  );
}

export default function Integrations() {
  const { current } = useWorkspace();
  const slack = useSlackIntegration(current?.id);
  const channelsHook = useSlackChannels(current?.id);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const masked = slack.integration?.config?.bot_token
    ? "●●●●●●●●●●●●" + String(slack.integration.config.bot_token).slice(-4)
    : "";

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-muted-foreground">Conecte ferramentas externas ao seu workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <SlackIcon />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <CardTitle>Slack</CardTitle>
                {slack.isConnected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" variant="outline">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">Não conectado</Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                Envie mensagens automáticas para canais do Slack a partir das suas automações.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {slack.isConnected ? (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Workspace Slack: </span>
                  <span className="font-medium">{slack.integration?.config?.team_name || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Bot Token: </span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded">
                    {showToken ? slack.integration?.config?.bot_token : masked}
                  </code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowToken((v) => !v)}>
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Canais disponíveis ({slack.channels.length})</p>
                  <Button variant="ghost" size="sm" onClick={() => slack.refreshChannels()} disabled={slack.refreshing}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${slack.refreshing ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {slack.channels.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum canal encontrado.</p>
                  )}
                  {slack.channels.map((c) => (
                    <Badge key={c.id} variant="secondary">#{c.name}</Badge>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t flex justify-end">
                <Button variant="destructive" size="sm" onClick={() => slack.remove()} disabled={slack.removing}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Desconectar
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert>
                <AlertDescription className="text-sm">
                  <strong>Como obter o Bot Token:</strong> acesse{" "}
                  <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    api.slack.com/apps <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  → crie um app → <em>OAuth &amp; Permissions</em> → adicione os scopes{" "}
                  <code className="bg-muted px-1 rounded">chat:write</code> e{" "}
                  <code className="bg-muted px-1 rounded">channels:read</code> → instale no workspace → copie o{" "}
                  <em>Bot User OAuth Token</em>.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bot Token</label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="xoxb-..."
                    className="font-mono"
                  />
                  <Button variant="ghost" size="icon" onClick={() => setShowToken((v) => !v)}>
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button onClick={() => slack.save(token)} disabled={!token.trim() || slack.saving}>
                    {slack.saving ? "Conectando..." : "Conectar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
