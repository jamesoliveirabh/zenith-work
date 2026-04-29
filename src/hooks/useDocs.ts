import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/react";

export interface Doc {
  id: string;
  workspace_id: string;
  space_id: string | null;
  parent_doc_id: string | null;
  title: string;
  content: JSONContent | null;
  content_text: string | null;
  icon: string | null;
  cover_url: string | null;
  is_published: boolean;
  published_token: string;
  position: number;
  created_by: string;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocTreeNode extends Doc {
  children: DocTreeNode[];
}

export interface DocMember {
  doc_id: string;
  user_id: string;
  permission: "view" | "comment" | "edit" | "full";
  profile?: { id: string; display_name: string | null; avatar_url: string | null; email: string | null };
}

export function useDocTree(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["doc-tree", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docs")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const docs = (data ?? []) as Doc[];
      const map = new Map<string, DocTreeNode>();
      docs.forEach((d) => map.set(d.id, { ...d, children: [] }));
      const roots: DocTreeNode[] = [];
      docs.forEach((d) => {
        const node = map.get(d.id)!;
        if (d.parent_doc_id && map.has(d.parent_doc_id)) {
          map.get(d.parent_doc_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      });
      return { roots, all: docs };
    },
  });
}

export function useDocDetail(docId: string | undefined) {
  return useQuery({
    queryKey: ["doc", docId],
    enabled: !!docId,
    queryFn: async () => {
      const { data, error } = await supabase.from("docs").select("*").eq("id", docId!).single();
      if (error) throw error;
      return data as Doc;
    },
  });
}

export function usePublishedDoc(token: string | undefined) {
  return useQuery({
    queryKey: ["published-doc", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docs")
        .select("id, title, content, icon, cover_url, updated_at, workspace_id")
        .eq("published_token", token!)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDoc() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { workspace_id: string; parent_doc_id?: string | null; space_id?: string | null; title?: string }) => {
      const { data, error } = await supabase
        .from("docs")
        .insert({
          workspace_id: input.workspace_id,
          parent_doc_id: input.parent_doc_id ?? null,
          space_id: input.space_id ?? null,
          title: input.title ?? "Sem título",
          created_by: user!.id,
          last_edited_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Doc;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["doc-tree", v.workspace_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Doc> & { id: string }) => {
      const clean: any = { ...patch };
      delete clean.created_at;
      delete clean.created_by;
      delete clean.published_token;
      const { error } = await supabase.from("docs").update(clean).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["doc", v.id] });
      qc.invalidateQueries({ queryKey: ["doc-tree"] });
    },
  });
}

export function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("docs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doc-tree"] });
      toast.success("Doc removido");
    },
  });
}

export function useMoveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parent_doc_id, position }: { id: string; parent_doc_id: string | null; position: number }) => {
      const { error } = await supabase.from("docs").update({ parent_doc_id, position }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-tree"] }),
  });
}

export function usePublishDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from("docs").update({ is_published: published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["doc", v.id] });
      qc.invalidateQueries({ queryKey: ["doc-tree"] });
    },
  });
}

// =========== task links ===========

export function useDocTaskLinks(docId: string | undefined) {
  return useQuery({
    queryKey: ["doc-task-links", docId],
    enabled: !!docId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_task_links")
        .select("task_id, tasks:tasks(id, title, status_id, list_id)")
        .eq("doc_id", docId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useLinkTask(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task_id, workspace_id }: { task_id: string; workspace_id: string }) => {
      const { error } = await supabase
        .from("doc_task_links")
        .insert({ doc_id: docId, task_id, workspace_id });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-task-links", docId] }),
  });
}

export function useUnlinkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc_id, task_id }: { doc_id: string; task_id: string }) => {
      const { error } = await supabase
        .from("doc_task_links")
        .delete()
        .eq("doc_id", doc_id)
        .eq("task_id", task_id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["doc-task-links", v.doc_id] }),
  });
}

// =========== members ===========

export function useDocMembers(docId: string | undefined) {
  return useQuery({
    queryKey: ["doc-members", docId],
    enabled: !!docId,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("doc_members")
        .select("doc_id, user_id, permission")
        .eq("doc_id", docId!);
      if (error) throw error;
      const ids = (members ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as DocMember[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email")
        .in("id", ids);
      return (members ?? []).map((m) => ({
        ...m,
        profile: profiles?.find((p) => p.id === m.user_id),
      })) as DocMember[];
    },
  });
}

export function useAddDocMember(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, permission }: { user_id: string; permission: DocMember["permission"] }) => {
      const { error } = await supabase
        .from("doc_members")
        .insert({ doc_id: docId, user_id, permission });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-members", docId] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateDocMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc_id, user_id, permission }: { doc_id: string; user_id: string; permission: DocMember["permission"] }) => {
      const { error } = await supabase
        .from("doc_members")
        .update({ permission })
        .eq("doc_id", doc_id)
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["doc-members", v.doc_id] }),
  });
}

export function useRemoveDocMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc_id, user_id }: { doc_id: string; user_id: string }) => {
      const { error } = await supabase.from("doc_members").delete()
        .eq("doc_id", doc_id).eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["doc-members", v.doc_id] }),
  });
}
