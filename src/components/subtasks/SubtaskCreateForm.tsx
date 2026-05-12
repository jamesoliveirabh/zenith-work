import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateSubtask, useSubtasks } from "@/hooks/useSubtasks";

interface Props {
  taskId: string;
  defaultParentId?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  showParentSelect?: boolean;
}

export function SubtaskCreateForm({
  taskId,
  defaultParentId = null,
  onSuccess,
  onCancel,
  showParentSelect = true,
}: Props) {
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(defaultParentId);
  const { data } = useSubtasks(taskId);
  const create = useCreateSubtask(taskId);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await create.mutateAsync({
      title: trimmed,
      parentSubtaskId: parentId,
    });
    setTitle("");
    onSuccess?.();
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        placeholder="Nova subtask..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={create.isPending}
        className="flex-1"
      />
      {showParentSelect && data && data.rows.length > 0 && (
        <Select
          value={parentId ?? "root"}
          onValueChange={(v) => setParentId(v === "root" ? null : v)}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Parent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="root">Nenhum (raiz)</SelectItem>
            {data.rows.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={!title.trim() || create.isPending}
          size="sm"
        >
          Criar
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="ghost" size="sm">
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

export default SubtaskCreateForm;
