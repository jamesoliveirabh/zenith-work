import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export interface CustomField {
  id: string;
  name: string;
  type: "text" | "number" | "select" | "checkbox" | "date" | "url";
  options: Array<{ label: string; color?: string }>;
}

interface Props {
  taskId: string;
  listId: string;
}

export function CustomFieldsSection({ taskId, listId }: Props) {
  const { current } = useWorkspace();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    (async () => {
      const { data: fs } = await supabase
        .from("custom_fields")
        .select("id,name,type,options")
        .eq("workspace_id", current.id)
        .or(`list_id.is.null,list_id.eq.${listId}`)
        .order("position");
      const { data: vs } = await supabase
        .from("task_field_values")
        .select("field_id,value")
        .eq("task_id", taskId);
      if (cancelled) return;
      setFields((fs ?? []) as CustomField[]);
      const map: Record<string, unknown> = {};
      (vs ?? []).forEach((v) => { map[v.field_id] = v.value; });
      setValues(map);
    })();
    return () => { cancelled = true; };
  }, [current, listId, taskId]);

  const save = async (field: CustomField, value: unknown) => {
    if (!current) return;
    setValues((p) => ({ ...p, [field.id]: value }));
    const { error } = await supabase.from("task_field_values").upsert({
      task_id: taskId,
      field_id: field.id,
      workspace_id: current.id,
      value: value as never,
    }, { onConflict: "task_id,field_id" });
    if (error) toast.error(error.message);
  };

  if (!fields.length) return null;

  return (
    <section>
      <h3 className="text-sm font-medium mb-2">Campos personalizados</h3>
      <div className="space-y-2">
        {fields.map((f) => {
          const v = values[f.id];
          return (
            <div key={f.id} className="grid grid-cols-[140px_1fr] items-center gap-3">
              <label className="text-xs text-muted-foreground truncate">{f.name}</label>
              {f.type === "text" && (
                <Input
                  defaultValue={(v as string) ?? ""}
                  onBlur={(e) => save(f, e.target.value)}
                  className="h-8"
                />
              )}
              {f.type === "url" && (
                <Input
                  type="url"
                  defaultValue={(v as string) ?? ""}
                  onBlur={(e) => save(f, e.target.value)}
                  className="h-8"
                />
              )}
              {f.type === "number" && (
                <Input
                  type="number"
                  defaultValue={(v as number) ?? ""}
                  onBlur={(e) => save(f, e.target.value === "" ? null : Number(e.target.value))}
                  className="h-8"
                />
              )}
              {f.type === "date" && (
                <Input
                  type="date"
                  defaultValue={(v as string) ?? ""}
                  onChange={(e) => save(f, e.target.value || null)}
                  className="h-8"
                />
              )}
              {f.type === "checkbox" && (
                <Checkbox
                  checked={!!v}
                  onCheckedChange={(c) => save(f, !!c)}
                />
              )}
              {f.type === "select" && (
                <Select value={(v as string) ?? ""} onValueChange={(val) => save(f, val)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {f.options.map((opt) => (
                      <SelectItem key={opt.label} value={opt.label}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
