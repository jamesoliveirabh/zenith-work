import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTaskDependencies } from "@/hooks/useTaskDependencies";
import { DependencyList } from "./DependencyList";
import { DependencyForm } from "./DependencyForm";

interface Props {
  taskId: string;
  taskTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DependencyViewer({ taskId, taskTitle, isOpen, onClose }: Props) {
  const { current } = useWorkspace();
  const [formOpen, setFormOpen] = useState(false);
  const { data } = useTaskDependencies(taskId);

  const existingIds = useMemo(() => {
    if (!data) return [];
    return [
      ...data.blocks.map((r) => r.taskId),
      ...data.blockedBy.map((r) => r.taskId),
      ...data.relatedTo.map((r) => r.taskId),
    ];
  }, [data]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">
              Dependências{taskTitle ? ` de ${taskTitle}` : ""}
            </DialogTitle>
          </DialogHeader>

          <DependencyList taskId={taskId} />

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Dependência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {formOpen && (
        <DependencyForm
          taskId={taskId}
          workspaceId={current?.id}
          excludeTaskIds={existingIds}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}
