import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSubtasks,
  useUpdateSubtask,
  useDeleteSubtask,
  useReorderSubtasks,
  type SubtaskNode,
} from "@/hooks/useSubtasks";
import { cn } from "@/lib/utils";
import { SubtaskCreateForm } from "./SubtaskCreateForm";
import { SubtaskEditDialog } from "./SubtaskEditDialog";

interface Props {
  taskId: string;
}

export function SubtasksList({ taskId }: Props) {
  const { data, isLoading } = useSubtasks(taskId);
  const reorder = useReorderSubtasks(taskId);
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-3/4" />
      </div>
    );
  }

  const tree = data?.tree ?? [];
  const rootIds = tree.map((n) => n.id);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rootIds.indexOf(String(active.id));
    const newIndex = rootIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(tree, oldIndex, newIndex).map((n, i) => ({
      id: n.id,
      order_index: i,
    }));
    reorder.mutate({ reordered });
  };

  return (
    <div className="space-y-3">
      {tree.length === 0 && !showAdd && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma subtask ainda.
        </div>
      )}

      {tree.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {tree.map((node) => (
                <SubtaskItem
                  key={node.id}
                  node={node}
                  taskId={taskId}
                  depth={0}
                  onEdit={setEditing}
                  sortable
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {showAdd ? (
        <SubtaskCreateForm
          taskId={taskId}
          onSuccess={() => setShowAdd(false)}
          onCancel={() => setShowAdd(false)}
          showParentSelect={false}
        />
      ) : (
        <Button
          onClick={() => setShowAdd(true)}
          variant="ghost"
          size="sm"
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Adicionar subtask
        </Button>
      )}

      <SubtaskEditDialog
        taskId={taskId}
        subtaskId={editing}
        isOpen={!!editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

interface ItemProps {
  node: SubtaskNode;
  taskId: string;
  depth: number;
  onEdit: (id: string) => void;
  sortable?: boolean;
}

function SubtaskItem({ node, taskId, depth, onEdit, sortable }: ItemProps) {
  const update = useUpdateSubtask(taskId);
  const remove = useDeleteSubtask(taskId);
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const sortableProps = useSortable({
    id: node.id,
    disabled: !sortable,
  });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortableProps;

  const style = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <li ref={sortable ? setNodeRef : undefined} style={style}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60",
        )}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        {sortable ? (
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="cursor-grab text-muted-foreground opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            aria-label="Arrastar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-4" />
        )}

        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Recolher" : "Expandir"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <Checkbox
          checked={node.is_completed}
          onCheckedChange={(v) =>
            update.mutate({
              subtaskId: node.id,
              patch: { is_completed: !!v },
            })
          }
        />

        <span
          className={cn(
            "flex-1 truncate text-sm",
            node.is_completed && "text-muted-foreground line-through",
          )}
        >
          {node.title}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(node.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => remove.mutate(node.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Deletar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AnimatePresence initial={false}>
        {hasChildren && expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <SubtaskItem
                key={child.id}
                node={child}
                taskId={taskId}
                depth={depth + 1}
                onEdit={onEdit}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

export default SubtasksList;
