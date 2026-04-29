import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, ChevronRight, ChevronDown, MoreHorizontal, Globe, Trash2 } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDocTree, useCreateDoc, useDeleteDoc, type DocTreeNode } from "@/hooks/useDocs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DocsHome() {
  const { current } = useWorkspace();
  const navigate = useNavigate();
  const { data, isLoading } = useDocTree(current?.id);
  const createDoc = useCreateDoc();
  const deleteDoc = useDeleteDoc();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const recent = useMemo(() => {
    return [...(data?.all ?? [])].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 9);
  }, [data]);

  const handleCreate = async (parent_doc_id?: string | null) => {
    if (!current) return;
    const d = await createDoc.mutateAsync({ workspace_id: current.id, parent_doc_id });
    if (parent_doc_id) setExpanded((e) => ({ ...e, [parent_doc_id]: true }));
    navigate(`/docs/${d.id}`);
  };

  return (
    <div className="flex h-full">
      <aside className="w-64 border-r overflow-auto p-2 shrink-0 bg-muted/20">
        <div className="flex items-center justify-between p-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Docs</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCreate(null)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground p-2">Carregando...</p>
        ) : !data?.roots.length ? (
          <p className="text-xs text-muted-foreground p-2">Sem docs ainda</p>
        ) : (
          <div className="space-y-0.5">
            {data.roots.map((d) => (
              <DocTreeItem
                key={d.id}
                node={d}
                depth={0}
                expanded={expanded}
                onToggle={(id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
                onOpen={(id) => navigate(`/docs/${id}`)}
                onAddChild={(id) => handleCreate(id)}
                onDelete={(id) => { if (confirm("Deletar este doc?")) deleteDoc.mutate(id); }}
              />
            ))}
          </div>
        )}
      </aside>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Docs</h1>
              <p className="text-sm text-muted-foreground">Documentos e wikis do workspace</p>
            </div>
            <Button onClick={() => handleCreate(null)}><Plus className="h-4 w-4 mr-2" /> Novo Doc</Button>
          </div>

          <h2 className="text-sm font-medium text-muted-foreground mb-3">Recentes</h2>
          {recent.length === 0 ? (
            <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              Nenhum doc ainda. Crie o primeiro.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recent.map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/docs/${d.id}`)}
                  className="text-left border rounded-lg p-4 hover:shadow-md hover:border-primary/50 transition bg-card"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{d.icon ?? "📄"}</span>
                    <h3 className="font-semibold truncate flex-1">{d.title}</h3>
                    {d.is_published && <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {d.content_text || "Sem conteúdo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(d.updated_at), { locale: ptBR, addSuffix: true })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocTreeItem({
  node, depth, expanded, onToggle, onOpen, onAddChild, onDelete,
}: {
  node: DocTreeNode; depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isOpen = expanded[node.id];
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted/60 cursor-pointer"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onOpen(node.id)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          className="h-4 w-4 flex items-center justify-center text-muted-foreground"
        >
          {hasChildren ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <span className="h-3 w-3" />}
        </button>
        <span className="text-sm">{node.icon ?? "📄"}</span>
        <span className="text-sm truncate flex-1">{node.title}</span>
        {node.is_published && <Globe className="h-3 w-3 text-muted-foreground" />}
        <button
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-background rounded"
        >
          <Plus className="h-3 w-3" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-background rounded"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onAddChild(node.id)}><Plus className="h-3.5 w-3.5 mr-2" /> Novo doc filho</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(node.id)} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Deletar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isOpen && hasChildren && node.children.map((c) => (
        <DocTreeItem key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onOpen={onOpen} onAddChild={onAddChild} onDelete={onDelete} />
      ))}
    </div>
  );
}
