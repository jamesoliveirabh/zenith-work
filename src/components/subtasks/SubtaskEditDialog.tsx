import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubtasks, useUpdateSubtask } from "@/hooks/useSubtasks";

interface Props {
  taskId: string;
  subtaskId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SubtaskEditDialog({ taskId, subtaskId, isOpen, onClose }: Props) {
  const { data } = useSubtasks(taskId);
  const update = useUpdateSubtask(taskId);

  const subtask = data?.rows.find((r) => r.id === subtaskId) ?? null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);

  useEffect(() => {
    if (subtask) {
      setTitle(subtask.title);
      setDescription(subtask.description ?? "");
      setParentId(subtask.parent_subtask_id);
    }
  }, [subtask]);

  if (!subtaskId) return null;

  const submit = async () => {
    if (!subtask) return;
    await update.mutateAsync({
      subtaskId: subtask.id,
      patch: {
        title: title.trim() || subtask.title,
        description: description.trim() || null,
      },
    });
    onClose();
  };

  const possibleParents =
    data?.rows.filter((r) => r.id !== subtaskId) ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar subtask</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subtask-title">Título</Label>
            <Input
              id="subtask-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subtask-desc">Descrição</Label>
            <Textarea
              id="subtask-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Parent subtask</Label>
            <Select
              value={parentId ?? "root"}
              onValueChange={(v) => setParentId(v === "root" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Nenhum (raiz)</SelectItem>
                {possibleParents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mudar o parent não é persistido nesta versão.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SubtaskEditDialog;
