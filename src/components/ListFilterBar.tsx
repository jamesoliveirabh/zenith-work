import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, ChevronDown, Plus, Save, Trash2, X, Globe2, User2, Search } from "lucide-react";
import { toast } from "sonner";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface ListFilters {
  search?: string;
  statusIds?: string[];
  priorities?: Priority[];
  assigneeIds?: (string | "unassigned")[];
  tags?: string[];
  dueRange?: "overdue" | "today" | "this_week" | "no_date" | "all";
}

export const EMPTY_FILTERS: ListFilters = {};

export function activeFilterCount(f: ListFilters): number {
  let n = 0;
  if (f.search?.trim()) n++;
  if (f.statusIds?.length) n++;
  if (f.priorities?.length) n++;
  if (f.assigneeIds?.length) n++;
  if (f.tags?.length) n++;
  if (f.dueRange && f.dueRange !== "all") n++;
  return n;
}

interface View {
  id: string;
  name: string;
  filters: ListFilters;
  is_shared: boolean;
  is_default: boolean;
  owner_id: string;
}

interface Props {
  listId: string;
  filters: ListFilters;
  onChange: (f: ListFilters) => void;
  statuses: { id: string; name: string; color: string | null }[];
  members: { user_id: string; name: string }[];
  availableTags: string[];
}

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};

export function ListFilterBar({ listId, filters, onChange, statuses, members, availableTags }: Props) {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [views, setViews] = useState<View[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveShared, setSaveShared] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");

  const loadViews = async () => {
    if (!listId) return;
    const { data } = await supabase
      .from("list_views")
      .select("id,name,filters,is_shared,is_default,owner_id")
      .eq("list_id", listId)
      .order("position")
      .order("created_at");
    const list = (data ?? []) as View[];
    setViews(list);
    const def = list.find((v) => v.is_default);
    if (def && activeViewId === null) {
      setActiveViewId(def.id);
      onChange(def.filters ?? {});
    }
  };

  useEffect(() => { loadViews(); /* eslint-disable-next-line */ }, [listId]);

  const count = activeFilterCount(filters);

  const applyView = (v: View) => {
    setActiveViewId(v.id);
    onChange(v.filters ?? {});
  };

  const clearAll = () => {
    onChange({});
    setActiveViewId(null);
  };

  const saveView = async () => {
    if (!current || !user || !saveName.trim()) return;
    const { error } = await supabase.from("list_views").insert({
      workspace_id: current.id,
      list_id: listId,
      owner_id: user.id,
      name: saveName.trim(),
      filters: filters as never,
      is_shared: saveShared,
    });
    if (error) return toast.error(error.message);
    toast.success("View salva");
    setSaveOpen(false);
    setSaveName("");
    setSaveShared(false);
    loadViews();
  };

  const deleteView = async (id: string) => {
    const { error } = await supabase.from("list_views").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (activeViewId === id) setActiveViewId(null);
    loadViews();
  };

  const setAsDefault = async (id: string) => {
    if (!user) return;
    // Clear my other defaults on this list, set this one
    await supabase
      .from("list_views")
      .update({ is_default: false })
      .eq("list_id", listId)
      .eq("owner_id", user.id);
    await supabase.from("list_views").update({ is_default: true }).eq("id", id);
    loadViews();
    toast.success("View padrão atualizada");
  };

  const activeView = useMemo(() => views.find((v) => v.id === activeViewId) ?? null, [views, activeViewId]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {/* Views dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            {activeView ? activeView.name : "Todas as tarefas"}
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Views</DropdownMenuLabel>
          <DropdownMenuItem onClick={clearAll}>
            <span className="flex-1">Todas as tarefas</span>
            {!activeViewId && <span className="text-xs text-muted-foreground">ativa</span>}
          </DropdownMenuItem>
          {views.length > 0 && <DropdownMenuSeparator />}
          {views.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onClick={() => applyView(v)}
              className="flex items-center gap-2"
            >
              {v.is_shared ? <Globe2 className="h-3.5 w-3.5 text-muted-foreground" /> : <User2 className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="flex-1 truncate">{v.name}</span>
              {v.is_default && <Badge variant="secondary" className="text-[10px] py-0 h-4">padrão</Badge>}
              {activeViewId === v.id && <span className="text-xs text-muted-foreground">ativa</span>}
            </DropdownMenuItem>
          ))}
          {activeView && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAsDefault(activeView.id)}>
                Definir como padrão
              </DropdownMenuItem>
              {(activeView.owner_id === user?.id) && (
                <DropdownMenuItem
                  onClick={() => deleteView(activeView.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Apagar view
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Search */}
      <Input
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Buscar tarefas..."
        className="h-8 w-48"
      />

      {/* Quick Assignee filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <User2 className="h-3.5 w-3.5 mr-1.5" />
            {(() => {
              const ids = filters.assigneeIds ?? [];
              if (ids.length === 0) return "Responsável";
              if (ids.length === 1) {
                const id = ids[0];
                if (id === "unassigned") return "Sem responsável";
                const m = members.find((x) => x.user_id === id);
                return m?.name ?? "Responsável";
              }
              return `Responsável (${ids.length})`;
            })()}
            {(filters.assigneeIds?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {filters.assigneeIds!.length}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Pesquisar usuário..."
                className="h-8 pl-8"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-0.5">
            {[
              { value: "unassigned" as const, label: "Sem responsável" },
              ...members
                .filter((m) =>
                  !assigneeSearch.trim() ||
                  m.name.toLowerCase().includes(assigneeSearch.trim().toLowerCase()),
                )
                .map((m) => ({ value: m.user_id, label: m.name })),
            ].map((opt) => {
              const selected = (filters.assigneeIds ?? []).includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5"
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => {
                      const cur = new Set(filters.assigneeIds ?? []);
                      cur.has(opt.value) ? cur.delete(opt.value) : cur.add(opt.value);
                      onChange({ ...filters, assigneeIds: Array.from(cur) as (string | "unassigned")[] });
                    }}
                  />
                  <span className="truncate flex-1">{opt.label}</span>
                </label>
              );
            })}
            {assigneeSearch && members.filter((m) =>
              m.name.toLowerCase().includes(assigneeSearch.trim().toLowerCase()),
            ).length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-3">Nenhum usuário encontrado</div>
            )}
          </div>
          {(filters.assigneeIds?.length ?? 0) > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost" size="sm" className="w-full h-7"
                onClick={() => onChange({ ...filters, assigneeIds: [] })}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Limpar responsável
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Filters popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Filtros
            {count > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{count}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="p-3 space-y-4 max-h-[60vh] overflow-y-auto">
            <FilterSection
              label="Status"
              options={statuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
              selected={filters.statusIds ?? []}
              onToggle={(v) => {
                const cur = new Set(filters.statusIds ?? []);
                cur.has(v) ? cur.delete(v) : cur.add(v);
                onChange({ ...filters, statusIds: Array.from(cur) });
              }}
            />
            <FilterSection
              label="Prioridade"
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              selected={filters.priorities ?? []}
              onToggle={(v) => {
                const cur = new Set(filters.priorities ?? []);
                cur.has(v as Priority) ? cur.delete(v as Priority) : cur.add(v as Priority);
                onChange({ ...filters, priorities: Array.from(cur) as Priority[] });
              }}
            />
            <FilterSection
              label="Responsável"
              options={[
                { value: "unassigned", label: "Sem responsável" },
                ...members.map((m) => ({ value: m.user_id, label: m.name })),
              ]}
              selected={filters.assigneeIds ?? []}
              onToggle={(v) => {
                const cur = new Set(filters.assigneeIds ?? []);
                cur.has(v as string | "unassigned")
                  ? cur.delete(v as string | "unassigned")
                  : cur.add(v as string | "unassigned");
                onChange({ ...filters, assigneeIds: Array.from(cur) as (string | "unassigned")[] });
              }}
            />
            {availableTags.length > 0 && (
              <FilterSection
                label="Tags"
                options={availableTags.map((t) => ({ value: t, label: t }))}
                selected={filters.tags ?? []}
                onToggle={(v) => {
                  const cur = new Set(filters.tags ?? []);
                  cur.has(v) ? cur.delete(v) : cur.add(v);
                  onChange({ ...filters, tags: Array.from(cur) });
                }}
              />
            )}
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vencimento</Label>
              <Select
                value={filters.dueRange ?? "all"}
                onValueChange={(v) => onChange({ ...filters, dueRange: v as ListFilters["dueRange"] })}
              >
                <SelectTrigger className="h-8 mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="overdue">Atrasadas</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="this_week">Esta semana</SelectItem>
                  <SelectItem value="no_date">Sem data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between border-t p-2">
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={count === 0}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={count === 0}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Salvar como view
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Salvar nova view</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="view-name">Nome</Label>
                    <Input
                      id="view-name"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Ex: Minhas urgentes"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Compartilhar com a equipe</div>
                      <div className="text-xs text-muted-foreground">Disponível para todos do workspace.</div>
                    </div>
                    <Switch checked={saveShared} onCheckedChange={setSaveShared} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={saveView} disabled={!saveName.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Criar view
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </PopoverContent>
      </Popover>

      {count > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clearAll}>
          <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}

function FilterSection({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { value: string; label: string; color?: string | null }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
              <Checkbox checked={checked} onCheckedChange={() => onToggle(o.value)} />
              {o.color && (
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: o.color }} />
              )}
              <span className="truncate flex-1">{o.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function applyFilters<T extends {
  title: string;
  status_id: string | null;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  tags: string[] | null;
}>(items: T[], f: ListFilters): T[] {
  const search = f.search?.trim().toLowerCase();
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

  return items.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search)) return false;
    if (f.statusIds?.length && (!t.status_id || !f.statusIds.includes(t.status_id))) return false;
    if (f.priorities?.length && !f.priorities.includes(t.priority)) return false;
    if (f.assigneeIds?.length) {
      const wantUnassigned = f.assigneeIds.includes("unassigned");
      const matchUser = t.assignee_id && f.assigneeIds.includes(t.assignee_id);
      if (!((wantUnassigned && !t.assignee_id) || matchUser)) return false;
    }
    if (f.tags?.length) {
      const tags = t.tags ?? [];
      if (!f.tags.some((tag) => tags.includes(tag))) return false;
    }
    if (f.dueRange && f.dueRange !== "all") {
      const due = t.due_date ? new Date(t.due_date) : null;
      if (f.dueRange === "no_date") {
        if (due) return false;
      } else {
        if (!due) return false;
        if (f.dueRange === "overdue" && due >= today) return false;
        if (f.dueRange === "today" && (due < today || due >= tomorrow)) return false;
        if (f.dueRange === "this_week" && (due < today || due >= weekEnd)) return false;
      }
    }
    return true;
  });
}
