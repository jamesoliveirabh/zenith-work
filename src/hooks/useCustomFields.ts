import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CustomFieldType = "text" | "number" | "select" | "checkbox" | "date" | "url";

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  options: { label: string; value: string; color?: string }[];
  position: number;
}

export const customFieldsKey = (listId: string) => ["custom-fields", listId] as const;

export function useCustomFields(listId: string | undefined) {
  return useQuery({
    queryKey: customFieldsKey(listId ?? ""),
    enabled: !!listId,
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await supabase
        .from("custom_fields")
        .select("id,name,type,options,position")
        .eq("list_id", listId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
  });
}

interface CreateFieldInput {
  workspace_id: string;
  name: string;
  type: CustomFieldType;
  position: number;
  created_by?: string | null;
}

export function useCreateCustomField(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFieldInput): Promise<CustomField> => {
      const { data, error } = await supabase
        .from("custom_fields")
        .insert({ list_id: listId, ...input })
        .select("id,name,type,options,position")
        .single();
      if (error) throw error;
      return data as CustomField;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: customFieldsKey(listId) }),
  });
}

export const fieldValuesKey = (listId: string) => ["task-field-values", listId] as const;

export function useSetTaskFieldValue(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId, fieldId, workspaceId, value,
    }: { taskId: string; fieldId: string; workspaceId: string; value: unknown }) => {
      const { error } = await supabase.from("task_field_values").upsert({
        task_id: taskId, field_id: fieldId, workspace_id: workspaceId, value,
      } as never, { onConflict: "task_id,field_id" });
      if (error) throw error;
    },
    onMutate: async ({ taskId, fieldId, value }) => {
      await qc.cancelQueries({ queryKey: ["tasks", listId] });
      const snapshots: { key: readonly unknown[]; data: unknown }[] = [];
      qc.getQueriesData<any[]>({ queryKey: ["tasks", listId] }).forEach(([key, data]) => {
        snapshots.push({ key, data });
        if (!data) return;
        qc.setQueryData<any[]>(
          key,
          data.map((t) =>
            t.id === taskId
              ? { ...t, fieldValues: { ...(t.fieldValues ?? {}), [fieldId]: value } }
              : t,
          ),
        );
      });
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      ctx?.snapshots.forEach(({ key, data }) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks", listId] }),
  });
}
