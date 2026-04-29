import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";

const credSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

const signupSchema = credSchema.extend({
  display_name: z.string().trim().min(1, "Informe seu nome").max(80),
});

export default function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const pendingInvite = sessionStorage.getItem("pendingInviteToken");
  const postAuthTarget = pendingInvite ? `/invite/${pendingInvite}` : "/";

  if (loading) return null;
  if (user) return <Navigate to={postAuthTarget} replace />;

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = credSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate("/", { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signupSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
      display_name: fd.get("display_name"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: parsed.data.display_name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Verifique seu email para confirmar.");
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Falha ao entrar com Google");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate(postAuthTarget, { replace: true });
  };

  return (
    <div className="relative min-h-screen gradient-subtle flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg gradient-primary shadow-elegant" />
            <span className="text-2xl font-semibold tracking-tight">Flow</span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Gestão de trabalho que respeita seu tempo
          </p>
        </div>

        <Card className="shadow-elegant border-border/60">
          <CardHeader className="pb-3">
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>Entre ou crie sua conta para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-4 mt-4">
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="si-password">Senha</Label>
                    <Input id="si-password" name="password" type="password" autoComplete="current-password" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-4">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="su-name">Nome</Label>
                    <Input id="su-name" name="display_name" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-email">Email</Label>
                    <Input id="su-email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-password">Senha</Label>
                    <Input id="su-password" name="password" type="password" autoComplete="new-password" required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar conta
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.74 0 3.3.6 4.53 1.78l3.4-3.4C17.95 1.45 15.24.4 12 .4 7.32.4 3.27 3.08 1.31 7l3.96 3.07C6.21 7.13 8.87 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.5 12.27c0-.78-.07-1.53-.2-2.27H12v4.51h6.47c-.28 1.46-1.13 2.7-2.4 3.53l3.86 3c2.26-2.09 3.57-5.17 3.57-8.77z" />
                <path fill="#FBBC05" d="M5.27 14.07a7.02 7.02 0 010-4.14L1.31 6.86A11.96 11.96 0 000 12c0 1.94.46 3.77 1.31 5.4l3.96-3.33z" />
                <path fill="#34A853" d="M12 23.6c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.79-2.09-6.73-4.93l-3.96 3.07C3.27 20.92 7.32 23.6 12 23.6z" />
              </svg>
              Continuar com Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
