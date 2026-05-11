import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DependencyViewer({ taskId, taskTitle, open, onOpenChange }: Props) {
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">
              Dependências{taskTitle ? ` de ${taskTitle}` : ""}
            </DialogTitle>
          </DialogHeader>

          <DependencyList taskId={taskId} />

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nova dependência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DependencyForm
        taskId={taskId}
        excludeTaskIds={existingIds}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}
