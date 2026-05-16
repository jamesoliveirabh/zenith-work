import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, PlayCircle, CheckCircle2, Trash2, Clock } from "lucide-react";
import {
  useTechSpikes, useCreateSpike, useUpdateSpike, useDeleteSpike,
  type SpikeStatus, type TechSpike,
} from "@/hooks/useTechQuality";

const COLUMNS: { id: SpikeStatus; label: string }[] = [
  { id: "planned", label: "Planejados" },
  { id: "in_progress", label: "Em curso" },
  { id: "completed", label: "Concluídos" },
];

interface Props { teamId: string; canEdit: boolean }

export function TechSpikeBoard({ teamId, canEdit }: Props) {
  const { data: spikes = [] } = useTechSpikes(teamId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TechSpike | null>(null);

  const grouped: Record<SpikeStatus, TechSpike[]> = { planned: [], in_progress: [], completed: [], abandoned: [] };
  spikes.forEach((s) => grouped[s.status].push(s));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Tech Spikes</h3>
          <p className="text-sm text-muted-foreground">Explorações timeboxed para reduzir incerteza.</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo spike
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <Card key={col.id} className="min-h-[300px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{col.label}</span>
                <Badge variant="secondary">{grouped[col.id].length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {grouped[col.id].length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>}
              {grouped[col.id].map((s) => (
                <div
                  key={s.id}
                  onClick={() => setEditing(s)}
                  className="rounded-md border bg-card p-3 text-sm cursor-pointer hover:border-primary/50"
                >
                  <div className="font-medium line-clamp-1">{s.title}</div>
                  {s.duration_hours && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {s.duration_hours}h
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateSpikeDialog open={createOpen} onOpenChange={setCreateOpen} teamId={teamId} />
      <SpikeDetailDialog spike={editing} onClose={() => setEditing(null)} canEdit={canEdit} />
    </div>
  );
}

function CreateSpikeDialog({ open, onOpenChange, teamId }: { open: boolean; onOpenChange: (o: boolean) => void; teamId: string }) {
  const create = useCreateSpike();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [hours, setHours] = useState("");
  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({ team_id: teamId, title, goal, duration_hours: hours ? Number(hours) : undefined });
    setTitle(""); setGoal(""); setHours("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo tech spike</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Objetivo: o que queremos aprender?" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <Input type="number" placeholder="Duração (horas)" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!title.trim()}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpikeDetailDialog({ spike, onClose, canEdit }: { spike: TechSpike | null; onClose: () => void; canEdit: boolean }) {
  const upd = useUpdateSpike();
  const del = useDeleteSpike();
  const [findings, setFindings] = useState("");
  const [recommended, setRecommended] = useState("");
  const [points, setPoints] = useState("");

  if (!spike) return null;
  return (
    <Dialog open={!!spike} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{spike.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {spike.goal && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Objetivo</p>
              <p className="text-sm">{spike.goal}</p>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{spike.status}</Badge>
            {spike.duration_hours && <span>⏱ {spike.duration_hours}h</span>}
            {spike.started_at && <span>Início: {new Date(spike.started_at).toLocaleString()}</span>}
          </div>
          {(spike.status === "completed" || spike.findings) && (
            <div>
              <label className="text-sm font-medium">Findings</label>
              <Textarea
                defaultValue={spike.findings ?? ""}
                onChange={(e) => setFindings(e.target.value)}
                placeholder="O que descobrimos?"
              />
            </div>
          )}
          {(spike.status === "completed" || spike.recommended_action) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Próxima ação</label>
                <Input defaultValue={spike.recommended_action ?? ""} onChange={(e) => setRecommended(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Pontos estimados</label>
                <Input type="number" defaultValue={spike.story_points_to_implement ?? ""} onChange={(e) => setPoints(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          {canEdit && (
            <Button variant="ghost" className="text-destructive" onClick={() => { del.mutate(spike.id); onClose(); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Remover
            </Button>
          )}
          <div className="flex gap-2">
            {canEdit && spike.status === "planned" && (
              <Button onClick={() => { upd.mutate({ id: spike.id, patch: { status: "in_progress", started_at: new Date().toISOString() } }); onClose(); }}>
                <PlayCircle className="h-4 w-4 mr-1" /> Iniciar
              </Button>
            )}
            {canEdit && spike.status === "in_progress" && (
              <Button onClick={() => {
                upd.mutate({ id: spike.id, patch: {
                  status: "completed", completed_at: new Date().toISOString(),
                  findings: findings || spike.findings,
                  recommended_action: recommended || spike.recommended_action,
                  story_points_to_implement: points ? Number(points) : spike.story_points_to_implement,
                } });
                onClose();
              }}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
              </Button>
            )}
            {canEdit && spike.status === "completed" && (findings || recommended || points) && (
              <Button variant="outline" onClick={() => {
                upd.mutate({ id: spike.id, patch: {
                  findings: findings || spike.findings,
                  recommended_action: recommended || spike.recommended_action,
                  story_points_to_implement: points ? Number(points) : spike.story_points_to_implement,
                } });
                onClose();
              }}>Salvar</Button>
            )}
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
