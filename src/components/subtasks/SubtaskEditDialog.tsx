import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useSubtasks,
  useUpdateSubtask,
  useDeleteSubtask,
} from "@/hooks/useSubtasks";

interface Props {
  taskId: string;
  subtaskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TITLE_MAX = 500;
const DESC_MAX = 2000;

export function SubtaskEditDialog({
  taskId,
  subtaskId,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const { data } = useSubtasks(taskId);
  const update = useUpdateSubtask(taskId);
  const remove = useDeleteSubtask(taskId);

  const subtask = data?.rows.find((r) => r.id === subtaskId) ?? null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (subtask) {
      setTitle(subtask.title);
      setDescription(subtask.description ?? "");
      setError(null);
    }
  }, [subtask]);

  const submit = useCallback(async () => {
    if (!subtask) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Título é obrigatório");
      return;
    }
    try {
      await update.mutateAsync({
        subtaskId: subtask.id,
        patch: {
          title: trimmed,
          description: description.trim() || null,
        },
      });
      toast.success("Subtask atualizada");
      onSuccess?.();
      onClose();
    } catch (e) {
      setError((e as Error).message ?? "Erro ao atualizar subtask");
    }
  }, [subtask, title, description, update, onSuccess, onClose]);

  const handleDelete = useCallback(async () => {
    if (!subtask) return;
    try {
      await remove.mutateAsync(subtask.id);
      toast.success("Subtask deletada");
      setConfirmDelete(false);
      onSuccess?.();
      onClose();
    } catch (e) {
      setError((e as Error).message ?? "Erro ao deletar");
      setConfirmDelete(false);
    }
  }, [subtask, remove, onSuccess, onClose]);

  if (!subtaskId) return null;

  const isSubmitting = update.isPending;
  const isDeleting = remove.isPending;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Subtask</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Título</Label>
              <Input
                id="edit-title"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Descrição</Label>
              <Textarea
                id="edit-desc"
                value={description}
                maxLength={DESC_MAX}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="flex justify-between gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting || isSubmitting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Deletar
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button onClick={submit} disabled={isSubmitting || !title.trim()}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar subtask?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita e removerá também todas as
              subtasks aninhadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default SubtaskEditDialog;
