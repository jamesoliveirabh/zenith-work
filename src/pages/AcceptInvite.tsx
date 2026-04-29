import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { refresh, setCurrent, workspaces } = useWorkspace();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Stash token then send to auth
      sessionStorage.setItem("pendingInviteToken", token ?? "");
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, token, navigate]);

  const accept = async () => {
    if (!token) return;
    setStatus("accepting");
    const { data, error } = await supabase.rpc("accept_workspace_invitation", { _token: token });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      toast.error(error.message);
      return;
    }
    sessionStorage.removeItem("pendingInviteToken");
    await refresh();
    const wsId = data as unknown as string;
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) setCurrent(ws);
    setStatus("done");
    toast.success("Você entrou no workspace");
    navigate("/", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Convite para workspace</CardTitle>
          <CardDescription>
            Você foi convidado(a) para colaborar. Entrando como <strong>{user.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "error" && (
            <p className="text-sm text-destructive">{message}</p>
          )}
          <Button onClick={accept} disabled={status === "accepting"} className="w-full">
            {status === "accepting" && <Loader2 className="h-4 w-4 animate-spin" />}
            Aceitar convite
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
