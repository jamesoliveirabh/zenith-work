import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Circle, Loader2, MessageSquare, Plus, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TagsInput } from "@/components/TagsInput";
import { CustomFieldsSection } from "@/components/CustomFieldsSection";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Subtask {
  id: string;
  title: string;
  completed_at: string | null;
  position: number;
}

interface Comment {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
}

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface Props {
  taskId: string | null;
  listId: string;
  doneStatusId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ taskId, listId, doneStatusId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  // Load task data
  useEffect(() => {
    if (!taskId || !open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: task }, { data: subs }, { data: cmts }] = await Promise.all([
        supabase.from("tasks").select("title,description,tags").eq("id", taskId).maybeSingle(),
        supabase.from("tasks").select("id,title,completed_at,position")
          .eq("parent_task_id", taskId).order("position").order("created_at"),
        supabase.from("task_comments").select("id,body,author_id,created_at")
          .eq("task_id", taskId).order("created_at"),
      ]);
      if (cancelled) return;
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setTags((task?.tags ?? []) as string[]);
      setSubtasks((subs ?? []) as Subtask[]);
      setComments((cmts ?? []) as Comment[]);

      const ids = Array.from(new Set((cmts ?? []).map((c) => c.author_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id,display_name,email").in("id", ids);
        if (!cancelled && profs) {
          setProfiles(Object.fromEntries(profs.map((p) => [p.id, p as Profile])));
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [taskId, open]);

  // Realtime: comments + subtasks for this task
  useEffect(() => {
    if (!taskId || !open) return;
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const c = payload.new as Comment;
            setComments((p) => (p.find((x) => x.id === c.id) ? p : [...p, c]));
            if (!profiles[c.author_id]) {
              const { data: prof } = await supabase
                .from("profiles").select("id,display_name,email").eq("id", c.author_id).maybeSingle();
              if (prof) setProfiles((p) => ({ ...p, [prof.id]: prof as Profile }));
            }
          } else if (payload.eventType === "DELETE") {
            setComments((p) => p.filter((c) => c.id !== (payload.old as Comment).id));
          } else if (payload.eventType === "UPDATE") {
            const c = payload.new as Comment;
            setComments((p) => p.map((x) => (x.id === c.id ? c : x)));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `parent_task_id=eq.${taskId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const s = payload.new as Subtask;
            setSubtasks((p) => (p.find((x) => x.id === s.id) ? p : [...p, s]));
          } else if (payload.eventType === "DELETE") {
            setSubtasks((p) => p.filter((s) => s.id !== (payload.old as Subtask).id));
          } else if (payload.eventType === "UPDATE") {
            const s = payload.new as Subtask;
            setSubtasks((p) => p.map((x) => (x.id === s.id ? { ...x, ...s } : x)));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [taskId, open, profiles]);

  const saveTask = async (patch: { title?: string; description?: string; tags?: string[] }) => {
    if (!taskId) return;
    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
    if (error) toast.error(error.message);
  };

  const updateTags = (next: string[]) => {
    setTags(next);
    saveTask({ tags: next });
  };

  const addSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtask.trim() || !taskId || !current || !user) return;
    const title = newSubtask.trim();
    setNewSubtask("");
    const { error } = await supabase.from("tasks").insert({
      list_id: listId,
      workspace_id: current.id,
      parent_task_id: taskId,
      title,
      created_by: user.id,
      position: subtasks.length,
    });
    if (error) toast.error(error.message);
  };

  const toggleSubtask = async (s: Subtask) => {
    const completed = !s.completed_at;
    setSubtasks((p) => p.map((x) => x.id === s.id
      ? { ...x, completed_at: completed ? new Date().toISOString() : null } : x));
    const patch: { completed_at: string | null; status_id?: string } = {
      completed_at: completed ? new Date().toISOString() : null,
    };
    if (completed && doneStatusId) patch.status_id = doneStatusId;
    const { error } = await supabase.from("tasks").update(patch).eq("id", s.id);
    if (error) toast.error(error.message);
  };

  const deleteSubtask = async (id: string) => {
    setSubtasks((p) => p.filter((s) => s.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !taskId || !current || !user) return;
    setPosting(true);
    const body = newComment.trim();
    const { error } = await supabase.from("task_comments").insert({
      task_id: taskId,
      workspace_id: current.id,
      author_id: user.id,
      body,
    });
    setPosting(false);
    if (error) return toast.error(error.message);
    setNewComment("");
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("task_comments").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const completedCount = subtasks.filter((s) => s.completed_at).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Detalhes da tarefa</DialogTitle>
          {loading ? (
            <div className="h-8 flex items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveTask({ title: title.trim() })}
              className="text-lg font-semibold border-0 shadow-none focus-visible:ring-1 px-2 -mx-2 h-auto py-1"
              placeholder="Título da tarefa"
            />
          )}
        </DialogHeader>

        <div className="space-y-5">
          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descrição</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => saveTask({ description })}
              placeholder="Adicione uma descrição..."
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags</label>
            <TagsInput value={tags} onChange={updateTags} />
          </div>

          {/* Custom fields */}
          {taskId && <CustomFieldsSection taskId={taskId} listId={listId} />}

          <Separator />

          {/* Subtasks */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">
                Subtarefas {subtasks.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    {completedCount}/{subtasks.length}
                  </span>
                )}
              </h3>
            </div>
            <div className="space-y-1">
              {subtasks.map((s) => {
                const done = !!s.completed_at;
                return (
                  <div key={s.id} className="flex items-center gap-2 group rounded-md hover:bg-muted/40 px-1 py-0.5">
                    <button onClick={() => toggleSubtask(s)} aria-label="Alternar conclusão">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-priority-low" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <span className={cn("flex-1 text-sm", done && "line-through text-muted-foreground")}>
                      {s.title}
                    </span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteSubtask(s.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <form onSubmit={addSubtask} className="flex gap-2 mt-2">
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Adicionar subtarefa..."
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!newSubtask.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>
          </section>

          <Separator />

          {/* Comments */}
          <section>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Comentários
              <span className="text-muted-foreground font-normal">({comments.length})</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-normal flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-priority-low animate-pulse" />
                ao vivo
              </span>
            </h3>
            <div className="space-y-3 mb-3">
              {comments.map((c) => {
                const prof = profiles[c.author_id];
                const name = prof?.display_name || prof?.email || "Usuário";
                const initial = name.charAt(0).toUpperCase();
                const mine = c.author_id === user?.id;
                return (
                  <div key={c.id} className="flex gap-2.5 group">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {mine && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="ml-auto text-[11px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-0.5">{c.body}</p>
                    </div>
                  </div>
                );
              })}
              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">Nenhum comentário ainda.</p>
              )}
            </div>
            <form onSubmit={postComment} className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    postComment(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Escreva um comentário... (Ctrl+Enter)"
                className="min-h-[60px] resize-none text-sm"
              />
              <Button type="submit" size="icon" disabled={posting || !newComment.trim()}>
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
