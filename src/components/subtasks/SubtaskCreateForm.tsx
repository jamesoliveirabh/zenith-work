import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useCreateSubtask } from "@/hooks/useSubtasks";

interface Props {
  taskId: string;
  parentSubtaskId?: string | null;
  parentTitle?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const TITLE_MAX = 500;
const DESC_MAX = 2000;

export function SubtaskCreateForm({
  taskId,
  parentSubtaskId = null,
  parentTitle,
  onSuccess,
  onCancel,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSubtask(taskId);

  const reset = () => {
    setTitle("");
    setDescription("");
    setError(null);
  };

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Título é obrigatório");
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        title: trimmed,
        description: description.trim() || null,
        parentSubtaskId: parentSubtaskId ?? null,
      });
      toast.success("Subtask criada com sucesso");
      reset();
      onSuccess?.();
    } catch (e) {
      setError((e as Error).message ?? "Erro ao criar subtask");
    }
  }, [title, description, parentSubtaskId, create, onSuccess]);

  const isSubmitting = create.isPending;
  const canSubmit = !!title.trim() && !isSubmitting;

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel?.();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
          e.preventDefault();
          submit();
        }
      }}
    >
      {parentSubtaskId && parentTitle && (
        <p className="text-xs text-muted-foreground">
          Dentro de <span className="font-medium">{parentTitle}</span>
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="subtask-title">Título da Subtask</Label>
        <Input
          id="subtask-title"
          autoFocus
          placeholder="Digite um título..."
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex justify-end text-xs text-muted-foreground">
          {title.length}/{TITLE_MAX}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subtask-desc">Descrição (opcional)</Label>
        <Textarea
          id="subtask-desc"
          placeholder="Adicione mais detalhes..."
          value={description}
          maxLength={DESC_MAX}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex justify-end text-xs text-muted-foreground">
          {description.length}/{DESC_MAX}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button onClick={submit} disabled={!canSubmit}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar
        </Button>
      </div>
    </div>
  );
}

export default SubtaskCreateForm;
