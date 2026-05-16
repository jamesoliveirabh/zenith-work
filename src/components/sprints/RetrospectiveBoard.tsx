import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, PlayCircle, ThumbsUp, Trash2, Plus, ListChecks } from "lucide-react";
import type { Sprint } from "@/hooks/useSprints";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRetrospective, useRetrospectiveItems, useCreateRetrospective,
  useUpdateRetrospective, useAddRetroItem, useUpdateRetroItem,
  useDeleteRetroItem, useToggleRetroVote,
  type RetroCategory, type RetrospectiveItem,
} from "@/hooks/useSprintAnalytics";

const COLUMNS: { id: RetroCategory; label: string; emoji: string; tone: string }[] = [
  { id: "keep", label: "Continuar", emoji: "✅", tone: "border-emerald-500/40" },
  { id: "start", label: "Começar", emoji: "🚀", tone: "border-blue-500/40" },
  { id: "stop", label: "Parar", emoji: "🛑", tone: "border-red-500/40" },
];

interface Props { sprint: Sprint; canEdit: boolean }

export function RetrospectiveBoard({ sprint, canEdit }: Props) {
  const { current } = useWorkspace();
  const { data: retro } = useRetrospective(sprint.id);
  const { data: items = [] } = useRetrospectiveItems(retro?.id);
  const create = useCreateRetrospective();
  const update = useUpdateRetrospective();

  if (!retro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Retrospectiva</CardTitle>
          <CardDescription>Reflita sobre o que deu certo, o que precisa mudar e o que parar de fazer.</CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit && current ? (
            <Button onClick={() => create.mutate({ sprint_id: sprint.id, team_id: sprint.team_id, workspace_id: current.id })}>
              <PlayCircle className="h-4 w-4 mr-1" /> Iniciar retrospectiva
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma retrospectiva foi iniciada para esta sprint.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const grouped: Record<RetroCategory, RetrospectiveItem[]> = { keep: [], start: [], stop: [] };
  items.forEach((it) => grouped[it.category].push(it));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                Retrospectiva
                <Badge variant={retro.status === "completed" ? "outline" : "default"}>
                  {retro.status === "completed" ? "Concluída" : "Em curso"}
                </Badge>
              </CardTitle>
              <CardDescription>Adicione itens, vote nos mais importantes e converta-os em ações.</CardDescription>
            </div>
            {canEdit && retro.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: retro.id, sprintId: sprint.id, patch: { status: "completed", conducted_at: new Date().toISOString() } })}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir retro
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            col={col}
            items={grouped[col.id]}
            retroId={retro.id}
            canEdit={canEdit && retro.status !== "completed"}
          />
        ))}
      </div>
    </div>
  );
}

interface ColProps {
  col: typeof COLUMNS[number];
  items: RetrospectiveItem[];
  retroId: string;
  canEdit: boolean;
}

function Column({ col, items, retroId, canEdit }: ColProps) {
  const add = useAddRetroItem();
  const [draft, setDraft] = useState("");

  return (
    <Card className={`border-2 ${col.tone}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{col.emoji} {col.label}</span>
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canEdit && (
          <div className="space-y-2">
            <Textarea
              placeholder="O que você quer destacar?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60px] text-sm"
            />
            <Button
              size="sm" className="w-full" disabled={!draft.trim()}
              onClick={async () => {
                await add.mutateAsync({ retrospective_id: retroId, category: col.id, content: draft });
                setDraft("");
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Adicionar
            </Button>
          </div>
        )}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Vazio</p>
        )}
        {items.map((it) => <ItemCard key={it.id} item={it} retroId={retroId} canEdit={canEdit} />)}
      </CardContent>
    </Card>
  );
}

function ItemCard({ item, retroId, canEdit }: { item: RetrospectiveItem; retroId: string; canEdit: boolean }) {
  const vote = useToggleRetroVote();
  const upd = useUpdateRetroItem();
  const del = useDeleteRetroItem();
  const [dueDate, setDueDate] = useState(item.due_date ?? "");

  return (
    <div className="rounded-md border bg-card p-3 text-sm space-y-2">
      <p className="whitespace-pre-wrap">{item.content}</p>
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm" variant={item.has_voted ? "default" : "outline"} className="h-7 px-2"
          onClick={() => vote.mutate({ itemId: item.id, retroId, voted: !!item.has_voted })}
        >
          <ThumbsUp className="h-3 w-3 mr-1" /> {item.votes}
        </Button>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button
              size="sm" variant={item.is_action_item ? "default" : "ghost"} className="h-7 px-2"
              onClick={() => upd.mutate({ id: item.id, retroId, patch: { is_action_item: !item.is_action_item } })}
              title="Marcar como ação"
            >
              <ListChecks className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
              onClick={() => del.mutate({ id: item.id, retroId })}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {item.is_action_item && canEdit && (
        <div className="flex items-center gap-2">
          <Input
            type="date" value={dueDate} className="h-7 text-xs"
            onChange={(e) => setDueDate(e.target.value)}
            onBlur={() => dueDate !== (item.due_date ?? "") && upd.mutate({ id: item.id, retroId, patch: { due_date: dueDate || null } })}
          />
        </div>
      )}
      {item.is_action_item && !canEdit && item.due_date && (
        <p className="text-xs text-muted-foreground">📅 {item.due_date}</p>
      )}
    </div>
  );
}
