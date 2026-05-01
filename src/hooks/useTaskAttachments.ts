import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { tasksKey } from "./useTasks";
import { assertEntitlement, decrementUsage, EntitlementBlockedError } from "@/lib/billing/enforcement";
import { useEntitlementGuard } from "@/components/billing/EntitlementGuardProvider";

export const ATTACHMENTS_BUCKET = "task-attachments";
export const SIGNED_URL_TTL = 3600; // 1h

export const attachmentsKey = (taskId: string) => ["attachments", taskId] as const;

export interface TaskAttachment {
  id: string;
  task_id: string;
  workspace_id: string;
  uploaded_by: string;
  storage_path: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  created_at: string;
  uploader: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
  /** Pre-signed preview URL for images, null otherwise. */
  preview_url: string | null;
}

export function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

export async function createSignedUrl(path: string, ttl = SIGNED_URL_TTL): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, ttl);
  if (error) {
    console.warn("signed URL error", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export function useTaskAttachments(taskId: string | null) {
  return useQuery({
    queryKey: attachmentsKey(taskId ?? ""),
    enabled: !!taskId,
    staleTime: 30_000,
    queryFn: async (): Promise<TaskAttachment[]> => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("id,task_id,workspace_id,uploaded_by,storage_path,filename,file_size_bytes,mime_type,created_at")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = data ?? [];
      const uploaderIds = Array.from(new Set(rows.map((r) => r.uploaded_by)));
      let profiles: Record<string, TaskAttachment["uploader"]> = {};
      if (uploaderIds.length > 0) {
        const { data: profs, error: pe } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,email")
          .in("id", uploaderIds);
        if (pe) throw pe;
        profiles = Object.fromEntries(
          (profs ?? []).map((p) => [p.id, p as TaskAttachment["uploader"]]),
        );
      }

      // Generate signed URLs only for images (preview).
      const previews = await Promise.all(
        rows.map(async (r) => {
          if (!isImageMime(r.mime_type)) return null;
          return await createSignedUrl(r.storage_path);
        }),
      );

      return rows.map((r, i) => ({
        ...(r as Omit<TaskAttachment, "uploader" | "preview_url">),
        uploader: profiles[r.uploaded_by] ?? null,
        preview_url: previews[i],
      }));
    },
  });
}

export interface UploadInput {
  file: File;
  workspaceId: string;
  userId: string;
}

function safeExt(filename: string) {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "bin";
}

export async function uploadAttachment(taskId: string, input: UploadInput): Promise<TaskAttachment> {
  const { file, workspaceId, userId } = input;
  const ext = safeExt(file.name);
  const id = crypto.randomUUID();
  const storage_path = `${userId}/${taskId}/${id}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storage_path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data: row, error: insErr } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      workspace_id: workspaceId,
      uploaded_by: userId,
      storage_path,
      filename: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || "application/octet-stream",
    })
    .select("id,task_id,workspace_id,uploaded_by,storage_path,filename,file_size_bytes,mime_type,created_at")
    .single();
  if (insErr) {
    // Best-effort cleanup
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storage_path]);
    throw insErr;
  }

  return {
    ...(row as Omit<TaskAttachment, "uploader" | "preview_url">),
    uploader: null,
    preview_url: isImageMime(row!.mime_type) ? await createSignedUrl(row!.storage_path) : null,
  };
}

export function useUploadAttachment(taskId: string, listId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadInput) => uploadAttachment(taskId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentsKey(taskId) });
      if (listId) qc.invalidateQueries({ queryKey: tasksKey(listId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAttachment(taskId: string, listId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (att: { id: string; storage_path: string }) => {
      const { error: rmErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove([att.storage_path]);
      if (rmErr) throw rmErr;
      const { error } = await supabase.from("task_attachments").delete().eq("id", att.id);
      if (error) throw error;
    },
    onMutate: async (att) => {
      await qc.cancelQueries({ queryKey: attachmentsKey(taskId) });
      const prev = qc.getQueryData<TaskAttachment[]>(attachmentsKey(taskId));
      if (prev) {
        qc.setQueryData<TaskAttachment[]>(
          attachmentsKey(taskId),
          prev.filter((a) => a.id !== att.id),
        );
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(attachmentsKey(taskId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: attachmentsKey(taskId) });
      if (listId) qc.invalidateQueries({ queryKey: tasksKey(listId) });
    },
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
