import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedValue, useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useCreateDependency, type DependencyType } from "@/hooks/useTaskDependencies";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Props {
  /** Source task that the new dependency is being added to. */
  taskId: string;
  /** Workspace scope (required for creation + circular check). */
  workspaceId: string | undefined;
  /** Called when the dialog should close (cancel or after success). */
  onClose: () => void;
  /** Called after a successful create. */
  onSuccess?: (dependencyId: string) => void;
  /** Existing related task ids — excluded from the search results. */
  excludeTaskIds?: string[];
  /** Controls visibility. Defaults to true (form is mounted = open). */
  open?: boolean;
}

const TYPE_OPTIONS: { value: DependencyType; label: string; hint: string }[] = [
  { value: "blocks", label: "Bloqueia", hint: "Esta task precisa terminar antes da outra" },
  { value: "blocked_by", label: "Bloqueada por", hint: "A outra precisa terminar antes desta" },
  { value: "related_to", label: "Relacionada a", hint: "Sem ordem de dependência" },
];

/** Map a Postgres error code (or message hint) to a friendly PT-BR string. */
function mapErrorCode(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code;
  const msg = (e?.message ?? "").toLowerCase();
  if (code === "42501" || msg.includes("row-level security")) {
    return "Você não tem permissão para editar esta task";
  }
  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return "Esta dependência já existe";
  }
  if (code === "23514" || msg.includes("circular") || msg.includes("check")) {
    return "Não é possível criar esta dependência (circular)";
  }
  return e?.message || "Erro ao criar dependência";
}

export function DependencyForm({
  taskId,
  workspaceId,
  onClose,
  onSuccess,
  excludeTaskIds = [],
  open = true,
}: Props) {
  const create = useCreateDependency(workspaceId);

  const [type, setType] = useState<DependencyType>("blocked_by");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string; subtitle?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounced = useDebouncedValue(query, 250);
  const { data: results = [], isFetching } = useGlobalSearch(debounced, workspaceId);

  const exclude = useMemo(() => new Set([taskId, ...excludeTaskIds]), [taskId, excludeTaskIds]);
  const tasks = results.filter((r) => r.result_type === "task" && !exclude.has(r.id));

  const reset = () => {
    setType("blocks");
    setQuery("");
    setPicked(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    setError(null);
    if (!picked) {
      setError("Selecione uma tarefa");
      return;
    }
    if (picked.id === taskId) {
      setError("Uma tarefa não pode depender de si mesma");
      return;
    }
    try {
      const res = await create.mutateAsync({
        sourceTaskId: taskId,
        targetTaskId: picked.id,
        dependencyType: type,
      });
      onSuccess?.(res.id);
      reset();
      onClose();
    } catch (e) {
      const msg = mapErrorCode(e);
      setError(msg);
      // useCreateDependency already toasts on error; avoid double toast for known mapped codes
      if (!toast) return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova dependência</DialogTitle>
          <DialogDescription>Vincule esta tarefa a outra do workspace.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dep-type">Relacionamento</Label>
            <Select value={type} onValueChange={(v) => setType(v as DependencyType)}>
              <SelectTrigger id="dep-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <div className="flex flex-col">
                      <span>{o.label}</span>
                      <span className="text-[11px] text-muted-foreground">{o.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dep-task">Tarefa</Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{picked.title}</p>
                  {picked.subtitle && (
                    <p className="text-[11px] text-muted-foreground truncate">{picked.subtitle}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="dep-task"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar tarefa..."
                    className="pl-7"
                    autoFocus
                  />
                  {isFetching && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {debounced.length < 2 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Digite pelo menos 2 caracteres.</p>
                  ) : tasks.length === 0 && !isFetching ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma tarefa encontrada.</p>
                  ) : (
                    <ul>
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setPicked({ id: t.id, title: t.title, subtitle: t.subtitle })
                            }
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm hover:bg-accent",
                              "flex flex-col gap-0.5",
                            )}
                          >
                            <span className="truncate">{t.title}</span>
                            {t.subtitle && (
                              <span className="text-[11px] text-muted-foreground truncate">{t.subtitle}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={create.isPending || !picked}>
            {create.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Validando...</>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
