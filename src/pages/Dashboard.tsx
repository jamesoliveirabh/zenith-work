import { Navigate } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent } from "@/components/ui/card";
import { ListChecks, Sparkles, Users } from "lucide-react";

export default function Dashboard() {
  const { current, loading } = useWorkspace();

  if (loading) return null;
  if (!current) return <Navigate to="/onboarding" replace />;

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo ao {current.name}</h1>
        <p className="text-muted-foreground mt-1">
          Crie um space na barra lateral para começar a organizar listas e tarefas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: ListChecks, title: "Liste tarefas", text: "Crie listas dentro de spaces e organize seu trabalho." },
          { icon: Users, title: "Convide a equipe", text: "Workspaces multi-tenant com permissões por papel." },
          { icon: Sparkles, title: "Em breve", text: "Kanban, automações, dashboards e mais." },
        ].map(({ icon: Icon, title, text }) => (
          <Card key={title} className="border-border/60 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-md bg-accent text-accent-foreground flex items-center justify-center mb-3">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
