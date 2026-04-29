import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare,
  FileText,
  Folder,
  History,
  Loader2,
  Search,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useDebouncedValue,
  useGlobalSearch,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from "@/hooks/useGlobalSearch";
import { useStatuses } from "@/hooks/useStatuses";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";

const RECENTS_KEY = "flow.globalSearch.recents";
const MAX_RECENTS = 5;

interface RecentItem {
  result_type: GlobalSearchResultType;
  id: string;
  title: string;
  subtitle: string;
  url_path: string;
  /** For tasks: the list id we parsed for opening the detail dialog. */
  list_id?: string;
}

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem) {
  try {
    const current = loadRecents().filter(
      (r) => !(r.id === item.id && r.result_type === item.result_type),
    );
    const next = [item, ...current].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Extract the list id from a task's url_path: "/list/{listId}". */
function parseListIdFromTaskPath(path: string): string | null {
  const m = path.match(/^\/list\/([0-9a-f-]+)/i);
  return m?.[1] ?? null;
}

function TypeIcon({ type }: { type: GlobalSearchResultType }) {
  if (type === "task") return <CheckSquare className="h-4 w-4 text-primary" />;
  if (type === "list") return <FileText className="h-4 w-4 text-blue-500" />;
  return <Folder className="h-4 w-4 text-amber-500" />;
}

const TYPE_LABEL: Record<GlobalSearchResultType, string> = {
  task: "Tarefas",
  list: "Listas",
  space: "Spaces",
};

function groupByType(results: GlobalSearchResult[]) {
  return results.reduce(
    (acc, r) => {
      acc[r.result_type] = acc[r.result_type] ?? [];
      acc[r.result_type]!.push(r);
      return acc;
    },
    {} as Record<GlobalSearchResultType, GlobalSearchResult[] | undefined>,
  );
}

export function GlobalSearch() {
  const { current } = useWorkspace();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [recents, setRecents] = useState<RecentItem[]>(() => loadRecents());

  // Selected task to open in detail dialog (after we know its listId).
  const [selectedTask, setSelectedTask] = useState<{
    taskId: string;
    listId: string;
  } | null>(null);
  const { data: taskStatuses = [] } = useStatuses(selectedTask?.listId);
  const doneStatusId = useMemo(
    () => taskStatuses.find((s) => s.is_done)?.id ?? null,
    [taskStatuses],
  );

  // Global keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Listen for an external "open" event from the topbar button.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener("global-search:open", onOpen);
    return () => document.removeEventListener("global-search:open", onOpen);
  }, []);

  // Reset query when closing.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: results = [], isFetching } = useGlobalSearch(
    debouncedQuery,
    current?.id,
  );

  const showRecents = debouncedQuery.trim().length < 2;
  const grouped = useMemo(() => groupByType(results), [results]);

  const handleSelect = (item: GlobalSearchResult | RecentItem) => {
    const recentItem: RecentItem = {
      result_type: item.result_type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      url_path: item.url_path,
      list_id:
        "list_id" in item && item.list_id
          ? item.list_id
          : item.result_type === "task"
            ? (parseListIdFromTaskPath(item.url_path) ?? undefined)
            : undefined,
    };
    saveRecent(recentItem);
    setRecents(loadRecents());
    setOpen(false);

    if (item.result_type === "task") {
      const listId =
        recentItem.list_id ?? parseListIdFromTaskPath(item.url_path);
      if (listId) {
        setSelectedTask({ taskId: item.id, listId });
      }
      return;
    }
    navigate(item.url_path);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          <Command shouldFilter={false} className="rounded-lg">
            <CommandInput
              placeholder="Buscar tarefas, listas, spaces..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[420px]">
              {showRecents ? (
                recents.length > 0 ? (
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5" />
                        Recentes
                      </span>
                    }
                  >
                    {recents.map((r) => (
                      <CommandItem
                        key={`recent-${r.result_type}-${r.id}`}
                        value={`recent-${r.id}`}
                        onSelect={() => handleSelect(r)}
                        className="gap-3"
                      >
                        <TypeIcon type={r.result_type} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.subtitle && (
                            <div className="text-xs text-muted-foreground truncate">
                              {r.subtitle}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
                          {TYPE_LABEL[r.result_type]}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <CommandEmpty>
                    Digite ao menos 2 caracteres para buscar.
                  </CommandEmpty>
                )
              ) : isFetching ? (
                <div className="p-3 space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : results.length === 0 ? (
                <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
              ) : (
                (["task", "list", "space"] as GlobalSearchResultType[]).map(
                  (type, idx) => {
                    const items = grouped[type];
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={type}>
                        {idx > 0 && <CommandSeparator />}
                        <CommandGroup heading={TYPE_LABEL[type]}>
                          {items.map((r) => (
                            <CommandItem
                              key={`${r.result_type}-${r.id}`}
                              value={`${r.result_type}-${r.id}`}
                              onSelect={() => handleSelect(r)}
                              className="gap-3"
                            >
                              <TypeIcon type={r.result_type} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {r.title}
                                </div>
                                {r.subtitle && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {r.subtitle}
                                  </div>
                                )}
                              </div>
                              <kbd className="hidden md:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">
                                ↵
                              </kbd>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </div>
                    );
                  },
                )
              )}
            </CommandList>
            {isFetching && !showRecents && (
              <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Buscando...
              </div>
            )}
          </Command>
        </DialogContent>
      </Dialog>

      {selectedTask && (
        <TaskDetailDialog
          taskId={selectedTask.taskId}
          listId={selectedTask.listId}
          doneStatusId={doneStatusId}
          open={!!selectedTask}
          onOpenChange={(o) => {
            if (!o) setSelectedTask(null);
          }}
        />
      )}
    </>
  );
}

/** Trigger button + ⌘K hint, intended for the topbar. */
export function GlobalSearchTrigger() {
  const onClick = () => {
    document.dispatchEvent(new CustomEvent("global-search:open"));
  };
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md border bg-background hover:bg-accent text-muted-foreground transition-colors"
      aria-label="Abrir busca global"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline text-xs">Buscar</span>
      <kbd className="hidden md:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-medium">
        {isMac ? "⌘K" : "Ctrl+K"}
      </kbd>
    </button>
  );
}
