import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { logPlatformAdminEvent } from "@/lib/admin/audit";

export default function AdminAccessDenied() {
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      void logPlatformAdminEvent("access_denied", {
        metadata: { email: user.email },
      });
    }
  }, [user]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" /> Acesso negado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Sua conta não tem permissão para acessar o painel administrativo da plataforma.
            Esta área é exclusiva para o time interno (<code>platform_owner</code>).
          </p>
          <p>
            Se você está procurando o app do produto, acesse-o pelo domínio principal.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/login">Trocar de conta</Link>
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await signOut();
                window.location.assign("/login");
              }}
            >
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
