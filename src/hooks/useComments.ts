import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CommentAuthor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface Comment {
  id: string;
  task_id: string;
  workspace_id: string;
  parent_comment_id: string | null;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
  author?: CommentAuthor;
  replies?: Comment[];
}

export const commentsKey = (taskId: string) => ["comments", taskId] as const;

interface CommentRow {
  id: string;
  task_id: string;
  workspace_id: string;
  parent_comment_id: string | null;
  author_id: string;
  body: string;
  mentions: string[] | null;
  created_at: string;
  updated_at: string;
}

async function fetchComments(taskId: string) {
  const { data, error } = await supabase
    .from("task_comments")
    .select("id, task_id, workspace_id, parent_comment_id, author_id, body, mentions, created_at, updated_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CommentRow[];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  let authors: Record<string, CommentAuthor> = {};
  if (authorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .in("id", authorIds);
    for (const p of profs ?? []) {
      authors[p.id as string] = {
        id: p.id as string,
        display_name: (p.display_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      };
    }
  }

  const map = new Map<string, Comment>();
  const roots: Comment[] = [];
  for (const r of rows) {
    map.set(r.id, {
      ...r,
      mentions: r.mentions ?? [],
      author: authors[r.author_id],
      replies: [],
    });
  }
  for (const node of map.values()) {
    if (node.parent_comment_id && map.has(node.parent_comment_id)) {
      map.get(node.parent_comment_id)!.replies!.push(node);
    } else {
      roots.push(node);
    }
  }
  return { comments: roots, total: rows.length };
}

export function useComments(taskId: string | undefined) {
  const qc = useQueryClient();

  // Lightweight realtime: invalidate on changes for this task.
  useEffect(() => {
    if (!taskId) return;
    const ch = supabase
      .channel(`comments-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        () => qc.invalidateQueries({ queryKey: commentsKey(taskId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, qc]);

  return useQuery({
    queryKey: taskId ? commentsKey(taskId) : ["comments", "_disabled"],
    enabled: !!taskId,
    queryFn: () => fetchComments(taskId!),
  });
}

export function useCreateComment(taskId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { content: string; parentCommentId?: string | null; mentions?: string[] }) => {
      if (!taskId) throw new Error("taskId required");
      if (!workspaceId) throw new Error("workspaceId required");
      if (!user) throw new Error("Sign in required");
      const body = input.content.trim();
      if (!body) throw new Error("Conteúdo vazio");
      const { data, error } = await supabase
        .from("task_comments")
        .insert({
          task_id: taskId,
          workspace_id: workspaceId,
          author_id: user.id,
          body,
          parent_comment_id: input.parentCommentId ?? null,
          mentions: input.mentions ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (taskId) qc.invalidateQueries({ queryKey: commentsKey(taskId) });
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao comentar"),
  });
}

export function useUpdateComment(taskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const body = content.trim();
      if (!body) throw new Error("Conteúdo vazio");
      const { data, error } = await supabase
        .from("task_comments")
        .update({ body })
        .eq("id", commentId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (taskId) qc.invalidateQueries({ queryKey: commentsKey(taskId) });
      toast.success("Comentário atualizado");
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar"),
  });
}

export function useDeleteComment(taskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (taskId) qc.invalidateQueries({ queryKey: commentsKey(taskId) });
      toast.success("Comentário removido");
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao deletar"),
  });
}
