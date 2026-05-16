import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExternalLink, GitPullRequest, Plus } from "lucide-react";
import { usePullRequests, useUpsertPullRequest, type PrStatus, type PullRequest } from "@/hooks/useTechQuality";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_TONE: Record<PrStatus, string> = {
  open: "bg-emerald-500/20 text-emerald-600",
  merged: "bg-violet-500/20 text-violet-600",
  closed: "bg-muted text-muted-foreground",
  draft: "bg-amber-500/20 text-amber-600",
};

const CI_ICON: Record<string, string> = {
  success: "✅", failure: "❌", error: "⚠️", pending: "⏳",
};

interface Props { taskId?: string | null; canEdit: boolean }

export function PullRequestList({ taskId, canEdit }: Props) {
  const { data: prs = [] } = usePullRequests(taskId);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" /> Pull Requests
            </CardTitle>
            <CardDescription>{prs.length} {prs.length === 1 ? "PR vinculada" : "PRs vinculadas"}</CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Vincular PR
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {prs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma PR vinculada.</p>}
        {prs.map((pr) => <PrRow key={pr.id} pr={pr} />)}
      </CardContent>
      <UpsertPrDialog open={open} onOpenChange={setOpen} taskId={taskId ?? null} />
    </Card>
  );
}

function PrRow({ pr }: { pr: PullRequest }) {
  return (
    <div className="flex items-center justify-between gap-3 border rounded-md p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{pr.title || `#${pr.pr_number}`}</span>
          <Badge className={STATUS_TONE[pr.status]} variant="secondary">{pr.status}</Badge>
          {pr.ci_status && <span className="text-base" title={pr.ci_status}>{CI_ICON[pr.ci_status]}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {pr.repository} · #{pr.pr_number} · {pr.author ?? "?"}
          {pr.created_at && ` · há ${formatDistanceToNow(parseISO(pr.created_at), { locale: ptBR })}`}
          {pr.review_count > 0 && ` · ${pr.review_count} reviews`}
        </div>
      </div>
      {pr.ci_url && (
        <Button size="sm" variant="ghost" asChild>
          <a href={pr.ci_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
        </Button>
      )}
    </div>
  );
}

function UpsertPrDialog({ open, onOpenChange, taskId }: { open: boolean; onOpenChange: (o: boolean) => void; taskId: string | null }) {
  const upsert = useUpsertPullRequest();
  const [repo, setRepo] = useState("");
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<PrStatus>("open");
  const [url, setUrl] = useState("");

  const submit = async () => {
    if (!repo || !number) return;
    await upsert.mutateAsync({
      task_id: taskId,
      pr_id: `${repo}#${number}`,
      repository: repo,
      pr_number: Number(number),
      title: title || null,
      author: author || null,
      status,
      created_at: new Date().toISOString(),
      merged_at: null,
      review_count: 0,
      ci_status: null,
      ci_url: url || null,
    });
    setRepo(""); setNumber(""); setTitle(""); setAuthor(""); setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular Pull Request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Repositório</label>
              <Input placeholder="org/repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Número</label>
              <Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Autor</label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as PrStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="merged">Merged</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">URL (PR ou CI)</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!repo || !number}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
