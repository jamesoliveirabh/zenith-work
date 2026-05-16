import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, PlayCircle, CheckCircle2, Trash2 } from "lucide-react";
import { useTeams } from "@/hooks/useTeams";
import {
  useSprints, useUpdateSprint, useDeleteSprint, useSprintTasks,
  type Sprint,
} from "@/hooks/useSprints";
import { useMyOrgAccess } from "@/hooks/useOrgRole";
import { SprintBoard } from "@/components/sprints/SprintBoard";
import { SprintBurndownChart } from "@/components/sprints/SprintBurndownChart";
import { SprintVelocityChart } from "@/components/sprints/SprintVelocityChart";
import { SprintFormDialog } from "@/components/sprints/SprintFormDialog";
import { SprintMetricsDashboard } from "@/components/sprints/SprintMetricsDashboard";
import { RetrospectiveBoard } from "@/components/sprints/RetrospectiveBoard";
import { SprintReportView } from "@/components/sprints/SprintReportView";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABEL: Record<Sprint["status"], string> = {
  planning: "Planejamento",
  active: "Ativa",
  completed: "Concluída",
  archived: "Arquivada",
};

const STATUS_VARIANT: Record<Sprint["status"], "default" | "secondary" | "outline"> = {
  planning: "secondary",
  active: "default",
  completed: "outline",
  archived: "outline",
};

export default function Sprints() {
  const { data: teams = [] } = useTeams();
  const { data: orgAccess } = useMyOrgAccess();
  const [teamId, setTeamId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId && teams.length > 0) setTeamId(teams[0].id);
  }, [teams, teamId]);

  const { data: sprints = [] } = useSprints(teamId);
  const updateSprint = useUpdateSprint();
  const deleteSprint = useDeleteSprint();

  const isOrgAdmin = !!orgAccess?.isOrgAdmin;
  const teamRole = teamId ? orgAccess?.teamRoles?.[teamId] : undefined;
  const canEdit = isOrgAdmin || teamRole === "gestor";

  const activeSprint = useMemo(() => sprints.find((s) => s.status === "active") ?? null, [sprints]);
  const planning = sprints.filter((s) => s.status === "planning");
  const completed = sprints.filter((s) => s.status === "completed" || s.status === "archived");

  const selectedSprint = useMemo(
    () => sprints.find((s) => s.id === selectedSprintId) ?? activeSprint,
    [sprints, selectedSprintId, activeSprint],
  );

  const { data: selectedTasks = [] } = useSprintTasks(selectedSprint?.id);

  const activate = (s: Sprint) => {
    if (!canEdit) return;
    if (sprints.some((x) => x.status === "active")) {
      alert("Já existe uma sprint ativa nesta equipa. Conclua-a primeiro.");
      return;
    }
    const plannedVelocity = (selectedTasks.length > 0 && s.id === selectedSprint?.id)
      ? selectedTasks.reduce((acc, t) => acc + (t.story_points ?? 0), 0)
      : s.planned_velocity;
    updateSprint.mutate({
      id: s.id, teamId: s.team_id,
      patch: { status: "active", planned_velocity: plannedVelocity },
    });
  };

  const complete = (s: Sprint) => {
    if (!canEdit) return;
    if (!confirm("Concluir esta sprint? A velocity será calculada automaticamente.")) return;
    updateSprint.mutate({ id: s.id, teamId: s.team_id, patch: { status: "completed" } });
  };

  const remove = (s: Sprint) => {
    if (!canEdit) return;
    if (!confirm("Remover sprint?")) return;
    deleteSprint.mutate({ id: s.id, teamId: s.team_id });
  };

  return (
    <div className="container py-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Sprints</h1>
          <p className="text-sm text-muted-foreground">Planejamento e acompanhamento por equipa.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={teamId} onValueChange={(v) => { setTeamId(v); setSelectedSprintId(null); }}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecione uma equipa" /></SelectTrigger>
            <SelectContent>
              {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit && teamId && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova sprint
            </Button>
          )}
        </div>
      </div>

      {!teamId ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Selecione uma equipa.</CardContent></Card>
      ) : (
        <Tabs defaultValue="board" className="space-y-4">
          <TabsList>
            <TabsTrigger value="board">Sprint Atual</TabsTrigger>
            <TabsTrigger value="planning">Planejamento ({planning.length})</TabsTrigger>
            <TabsTrigger value="history">Histórico ({completed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="space-y-4">
            {!selectedSprint ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Nenhuma sprint ativa. Crie uma na aba "Planejamento" e ative-a.
              </CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {selectedSprint.name}
                          <Badge variant={STATUS_VARIANT[selectedSprint.status]}>
                            {STATUS_LABEL[selectedSprint.status]}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {format(parseISO(selectedSprint.start_date), "dd MMM", { locale: ptBR })} —{" "}
                          {format(parseISO(selectedSprint.end_date), "dd MMM yyyy", { locale: ptBR })}
                        </CardDescription>
                      </div>
                      {canEdit && selectedSprint.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => complete(selectedSprint)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir sprint
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <SprintBoard sprint={selectedSprint} canEdit={canEdit && selectedSprint.status !== "completed"} />
                  </div>
                  <div className="space-y-4">
                    <SprintBurndownChart sprint={selectedSprint} tasks={selectedTasks} />
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="planning" className="space-y-4">
            {planning.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sprint em planejamento.</CardContent></Card>
            ) : (
              planning.map((s) => (
                <Card key={s.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        <CardDescription>
                          {format(parseISO(s.start_date), "dd MMM", { locale: ptBR })} —{" "}
                          {format(parseISO(s.end_date), "dd MMM yyyy", { locale: ptBR })}
                          {s.goal && ` · 🎯 ${s.goal}`}
                        </CardDescription>
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedSprintId(s.id); }}>
                            Abrir
                          </Button>
                          <Button size="sm" onClick={() => activate(s)}>
                            <PlayCircle className="h-4 w-4 mr-1" /> Ativar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  {selectedSprintId === s.id && (
                    <CardContent>
                      <SprintBoard sprint={s} canEdit={canEdit} />
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <SprintVelocityChart teamId={teamId} />
            {completed.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {s.name}
                    <Badge variant="outline">{STATUS_LABEL[s.status]}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {format(parseISO(s.start_date), "dd MMM", { locale: ptBR })} —{" "}
                    {format(parseISO(s.end_date), "dd MMM yyyy", { locale: ptBR })} · Planejado:{" "}
                    {s.planned_velocity}pt · Entregue: {s.actual_velocity}pt
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}

      {teamId && (
        <SprintFormDialog open={createOpen} onOpenChange={setCreateOpen} teamId={teamId} />
      )}
    </div>
  );
}
