import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useSubtasks,
  useUpdateSubtask,
  useDeleteSubtask,
  type SubtaskNode,
} from "@/hooks/useSubtasks";
import { cn } from "@/lib/utils";
import { SubtaskCreateForm } from "./SubtaskCreateForm";

interface Props {
  taskId: string;
  onSubtaskCreated?: () => void;
  onSubtaskUpdated?: () => void;
  onSubtaskDeleted?: () => void;
}

const MAX_DEPTH = 3;

function countDescendants(node: SubtaskNode): number {
  return node.children.reduce(
    (acc, c) => acc + 1 + countDescendants(c),
    0,
  );
}

export function SubtasksList({
  taskId,
  onSubtaskCreated,
  onSubtaskUpdated,
  onSubtaskDeleted,
}: Props) {
  const { data, isLoading, isError, refetch } = useSubtasks(taskId);
  const update = useUpdateSubtask(taskId);
  const remove = useDeleteSubtask(taskId);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SubtaskNode | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleCompleted = useCallback(
    async (node: SubtaskNode) => {
      await update.mutateAsync({
        subtaskId: node.id,
        patch: { is_completed: !node.is_completed },
      });
      onSubtaskUpdated?.();
    },
    [update, onSubtaskUpdated],
  );

  const handleRename = useCallback(
    async (node: SubtaskNode, title: string) => {
      const trimmed = title.trim();
      if (!trimmed || trimmed === node.title) {
        setEditingId(null);
        return;
      }
      await update.mutateAsync({
        subtaskId: node.id,
        patch: { title: trimmed },
      });
      setEditingId(null);
      onSubtaskUpdated?.();
    },
    [update, onSubtaskUpdated],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success("Subtask deletada");
      onSubtaskDeleted?.();
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, remove, onSubtaskDeleted]);

  const tree = data?.tree ?? [];
  const total = data?.total ?? 0;
  const completed = data?.completed ?? 0;
  const progress = data?.progress ?? 0;

  const renderNodes = useMemo(() => {
    function render(nodes: SubtaskNode[], depth: number): React.ReactNode {
      return nodes.map((node) => {
        const isExpanded = expandedIds.has(node.id);
        return (
          <div key={node.id}>
            <SubtaskItem
              node={node}
              depth={depth}
              isExpanded={isExpanded}
              onToggleExpand={() => toggleExpand(node.id)}
              onToggleCompleted={() => handleToggleCompleted(node)}
              onStartEdit={() => setEditingId(node.id)}
              onCommitEdit={(t) => handleRename(node, t)}
              onCancelEdit={() => setEditingId(null)}
              isEditing={editingId === node.id}
              isUpdating={update.isPending}
              isDeleting={remove.isPending}
              onRequestDelete={() => setPendingDelete(node)}
            />
            {isExpanded && node.children.length > 0 && (
              <div>{render(node.children, depth + 1)}</div>
            )}
          </div>
        );
      });
    }
    return render;
  }, [
    expandedIds,
    editingId,
    update.isPending,
    remove.isPending,
    toggleExpand,
    handleToggleCompleted,
    handleRename,
  ]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar subtasks.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          {completed}/{total} subtasks concluídas ({progress}%)
        </p>
      )}

      {total === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma subtask. Comece criando uma.
          </p>
          {!showCreate && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setShowCreate(true)}
            >
              Criar primeira subtask
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">{renderNodes(tree, 0)}</div>
      )}

      {showCreate ? (
        <div className="rounded-md border p-3">
          <SubtaskCreateForm
            taskId={taskId}
            onSuccess={() => {
              setShowCreate(false);
              onSubtaskCreated?.();
            }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      ) : (
        total > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreate(true)}
          >
            + Adicionar subtask
          </Button>
        )
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar subtask?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && countDescendants(pendingDelete) > 0
                ? `Isso deletará ${countDescendants(pendingDelete)} subtasks também.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ItemProps {
  node: SubtaskNode;
  depth: number;
  isExpanded: boolean;
  isEditing: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleExpand: () => void;
  onToggleCompleted: () => void;
  onStartEdit: () => void;
  onCommitEdit: (title: string) => void;
  onCancelEdit: () => void;
  onRequestDelete: () => void;
}

function SubtaskItem({
  node,
  depth,
  isExpanded,
  isEditing,
  isUpdating,
  isDeleting,
  onToggleExpand,
  onToggleCompleted,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onRequestDelete,
}: ItemProps) {
  const [draft, setDraft] = useState(node.title);
  const hasChildren = node.children.length > 0;
  const showCheckbox = depth < MAX_DEPTH;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded p-2 transition-colors duration-200 hover:bg-muted/50",
        depth > 0 && "border-l-2 border-muted",
      )}
      style={{ marginLeft: depth * 16 }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-muted-foreground transition-transform hover:text-foreground"
          aria-label={isExpanded ? "Recolher" : "Expandir"}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ) : (
        <span className="w-4" />
      )}

      {showCheckbox ? (
        isUpdating ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Checkbox
            checked={node.is_completed}
            onCheckedChange={onToggleCompleted}
            disabled={isUpdating}
            className="cursor-pointer"
          />
        )
      ) : (
        <span className="w-4" />
      )}

      {isEditing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitEdit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitEdit(draft);
            } else if (e.key === "Escape") {
              setDraft(node.title);
              onCancelEdit();
            }
          }}
          className="h-7 flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(node.title);
            onStartEdit();
          }}
          className={cn(
            "flex-1 truncate text-left text-sm",
            node.is_completed && "text-muted-foreground line-through",
          )}
        >
          {node.title}
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            disabled={isDeleting}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={onRequestDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Deletar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default SubtasksList;
