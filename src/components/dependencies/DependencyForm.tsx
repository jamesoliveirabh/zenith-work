import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
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
  /** Task that the new dependency is being added to (the "source"). */
  taskId: string;
  /** Existing related task ids — excluded from search results. */
  excludeTaskIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_OPTIONS: { value: DependencyType; label: string; hint: string }[] = [
  { value: "blocks", label: "Bloqueia", hint: "Esta task precisa terminar antes da outra" },
  { value: "blocked_by", label: "Bloqueada por", hint: "A outra precisa terminar antes desta" },
  { value: "related_to", label: "Relacionada", hint: "Sem ordem de dependência" },
];

export function DependencyForm({ taskId, excludeTaskIds = [], open, onOpenChange }: Props) {
  const { current } = useWorkspace();
  const create = useCreateDependency(current?.id);

  const [type, setType] = useState<DependencyType>("blocks");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string; subtitle?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounced = useDebouncedValue(query, 250);
  const { data: results = [], isFetching } = useGlobalSearch(debounced, current?.id);

  const exclude = useMemo(() => new Set([taskId, ...excludeTaskIds]), [taskId, excludeTaskIds]);
  const tasks = results.filter((r) => r.result_type === "task" && !exclude.has(r.id));

  const reset = () => {
    setType("blocks");
    setQuery("");
    setPicked(null);
    setError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSave = async () => {
    setError(null);
    if (!picked) {
      setError("Selecione uma tarefa");
      return;
    }
    if (picked.id === taskId) {
      setError("Não é possível depender da própria tarefa");
      return;
    }
    try {
      await create.mutateAsync({
        sourceTaskId: taskId,
        targetTaskId: picked.id,
        dependencyType: type,
      });
      close(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar dependência");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
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
          <Button variant="outline" onClick={() => close(false)} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={create.isPending || !picked}>
            {create.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...</>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
