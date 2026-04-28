import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

const schema = z.object({ name: z.string().trim().min(2, "Informe um nome").max(80) });

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";

export default function Onboarding() {
  const { user } = useAuth();
  const { refresh } = useWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ name: fd.get("name") });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setBusy(true);
    const baseSlug = slugify(parsed.data.name);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase
      .from("workspaces")
      .insert({ name: parsed.data.name, slug, owner_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Workspace criado!");
    await refresh();
    navigate("/", { replace: true });
  };

  return (
    <div className="relative min-h-screen gradient-subtle flex items-center justify-center p-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <Card className="w-full max-w-md shadow-elegant">
        <CardHeader>
          <CardTitle>Crie seu workspace</CardTitle>
          <CardDescription>Um espaço para sua equipe organizar o trabalho.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome do workspace</Label>
              <Input id="name" name="name" placeholder="Acme Inc." required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
