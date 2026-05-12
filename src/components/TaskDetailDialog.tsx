import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Check, Loader2, MessageSquare, Plus, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTaskDependencies } from "@/hooks/useTaskDependencies";
import { DependencyList } from "@/components/dependencies/DependencyList";
import { DependencyForm } from "@/components/dependencies/DependencyForm";
import { TaskDependencyIndicator } from "@/components/dependencies/TaskDependencyIndicator";
import { SubtasksList } from "@/components/subtasks/SubtasksList";
import { useTaskPresence } from "@/hooks/useRealtimeUpdates";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip as PresenceTooltip,
  TooltipContent as PresenceTooltipContent,
  TooltipProvider as PresenceTooltipProvider,
  TooltipTrigger as PresenceTooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
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
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { TimeTracker } from "@/components/TimeTracker";
import { TaskAttachments } from "@/components/TaskAttachments";
import { RichTextEditor, type JSONContent } from "@/components/RichTextEditor";
import {
  taskDetailKey, useCreateComment, useCreateSubtask, useDeleteComment,
  useTaskDetail, useUpdateTaskAssignees, useUpdateTaskMeta,
} from "@/hooks/useTaskDetail";
import { useListMembers } from "@/hooks/useListMembers";
import { uploadAttachment, createSignedUrl, isImageMime, attachmentsKey } from "@/hooks/useTaskAttachments";
import { toast } from "sonner";

interface Props {
  taskId: string | null;
  listId: string;
  doneStatusId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ taskId, listId, doneStatusId: _doneStatusId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const qc = useQueryClient();

  const { data: detail, isLoading: loading } = useTaskDetail(open ? taskId : null);
  const { data: members = [] } = useListMembers(open ? current?.id : undefined);

  const updateMeta = useUpdateTaskMeta(taskId ?? "");
  const createSubtask = useCreateSubtask(taskId ?? "");
  const createComment = useCreateComment(taskId ?? "");
  const deleteCommentMut = useDeleteComment(taskId ?? "");
  const updateAssignees = useUpdateTaskAssignees(taskId ?? "");

  // Local UI state for inputs (kept controlled)
  const [title, setTitle] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync title from query data when it (re)loads
  useEffect(() => {
    if (detail) setTitle(detail.title);
  }, [detail?.id]);

  // Realtime: invalidate cache on remote changes for this task
  useEffect(() => {
    if (!taskId || !open) return;
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        () => { qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `parent_task_id=eq.${taskId}` },
        () => { qc.invalidateQueries({ queryKey: taskDetailKey(taskId) }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [taskId, open, qc]);

  // Cleanup save-status timers
  useEffect(() => {
    return () => {
      if (descTimer.current) clearTimeout(descTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [taskId]);

  const handleDescriptionChange = (next: JSONContent) => {
    if (!taskId) return;
    setSaveStatus("saving");
    if (descTimer.current) clearTimeout(descTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    descTimer.current = setTimeout(async () => {
      try {
        await updateMeta.mutateAsync({ description: next });
        setSaveStatus("saved");
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("idle");
      }
    }, 1000);
  };

  const updateTags = (next: string[]) => {
    updateMeta.mutate({ tags: next });
  };

  const addSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtask.trim() || !taskId || !current || !user) return;
    const t = newSubtask.trim();
    setNewSubtask("");
    await createSubtask.mutateAsync({
      title: t,
      list_id: listId,
      workspace_id: current.id,
      created_by: user.id,
      position: detail?.subtasks.length ?? 0,
    });
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !taskId || !current || !user) return;
    setPosting(true);
    try {
      await createComment.mutateAsync({
        body: newComment.trim(),
        workspace_id: current.id,
        author_id: user.id,
      });
      setNewComment("");
    } catch {
      // error toast handled in hook
    } finally {
      setPosting(false);
    }
  };

  const addAssignee = (userId: string) => {
    if (!current) return;
    const u = members.find((m) => m.id === userId);
    if (!u) return;
    updateAssignees.mutate({ workspaceId: current.id, add: { user: u } });
  };

  const removeAssignee = (userId: string) => {
    if (!current) return;
    updateAssignees.mutate({ workspaceId: current.id, remove: { userId } });
  };

  const subtasks = detail?.subtasks ?? [];
  const comments = detail?.comments ?? [];
  const profiles = detail?.profiles ?? {};
  const tags = detail?.tags ?? [];
  const assigneeIds = (detail?.assignees ?? []).map((a) => a.id);
  const description = (detail?.description ?? null) as JSONContent | null;
  const completedCount = subtasks.filter((s) => s.completed_at).length;

  // Dependencies for this task (used for the blocked banner + section).
  const { data: deps } = useTaskDependencies(open && taskId ? taskId : undefined);
  const blockedBy = deps?.blockedBy ?? [];
  const [depFormOpen, setDepFormOpen] = useState(false);
  const existingDepIds = useMemo(
    () => [
      ...(deps?.blocks ?? []).map((r) => r.taskId),
      ...(deps?.blockedBy ?? []).map((r) => r.taskId),
      ...(deps?.relatedTo ?? []).map((r) => r.taskId),
    ],
    [deps],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Detalhes da tarefa</DialogTitle>
          {loading ? (
            <div className="h-8 flex items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  const v = title.trim();
                  if (v && v !== detail?.title) updateMeta.mutate({ title: v });
                }}
                className="text-lg font-semibold border-0 shadow-none focus-visible:ring-1 px-2 -mx-2 h-auto py-1 flex-1 min-w-0"
                placeholder="Título da tarefa"
              />
              {taskId && (
                <TaskDependencyIndicator taskId={taskId} taskTitle={detail?.title} compact size="sm" />
              )}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-5">
          {blockedBy.length > 0 && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <span className="font-medium">⚠️ Esta task está bloqueada por </span>
                {blockedBy.slice(0, 3).map((b, i) => (
                  <span key={b.dependencyId}>
                    {i > 0 && ", "}
                    <span className="font-medium underline-offset-2 underline">{b.title}</span>
                  </span>
                ))}
                {blockedBy.length > 3 && ` +${blockedBy.length - 3}`}
                . Conclua a{blockedBy.length > 1 ? "s" : ""} task{blockedBy.length > 1 ? "s" : ""} bloqueante{blockedBy.length > 1 ? "s" : ""} primeiro.
              </AlertDescription>
            </Alert>
          )}

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              {saveStatus === "saving" && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-[11px] text-priority-low inline-flex items-center gap-1">
                  <Check className="h-3 w-3" /> Salvo
                </span>
              )}
            </div>
            <RichTextEditor
              content={description}
              onChange={handleDescriptionChange}
              onImageUpload={async (file) => {
                if (!taskId || !current || !user) return null;
                if (!isImageMime(file.type)) return null;
                if (file.size > 50 * 1024 * 1024) {
                  toast.error(`"${file.name}" excede 50MB`);
                  return null;
                }
                try {
                  const att = await uploadAttachment(taskId, {
                    file, workspaceId: current.id, userId: user.id,
                  });
                  qc.invalidateQueries({ queryKey: attachmentsKey(taskId) });
                  return att.preview_url ?? (await createSignedUrl(att.storage_path));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao enviar imagem");
                  return null;
                }
              }}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags</label>
            <TagsInput value={tags} onChange={updateTags} />
            <p className="text-[11px] text-muted-foreground mt-1">
              Pressione Enter ou vírgula para adicionar a tag.
            </p>
          </div>

          {/* Assignees */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Responsáveis</label>
            <AssigneeSelect
              members={members}
              selectedIds={assigneeIds}
              onAdd={addAssignee}
              onRemove={removeAssignee}
              size="md"
              maxVisible={5}
            />
          </div>

          {/* Custom fields */}
          {taskId && <CustomFieldsSection taskId={taskId} listId={listId} />}

          {/* Time tracking */}
          {taskId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tempo
              </label>
              <TimeTracker
                taskId={taskId}
                estimateSeconds={detail?.time_estimate_seconds ?? null}
                onEstimateChange={(s) => updateMeta.mutate({ time_estimate_seconds: s })}
              />
            </div>
          )}

          <Separator />

          {/* Attachments */}
          {taskId && <TaskAttachments taskId={taskId} listId={listId} />}

          <Separator />

          {/* Tabs: Subtasks + Dependencies */}
          {taskId && (
            <Tabs defaultValue="subtasks" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="subtasks">
                  Subtasks{subtasks.length > 0 && (
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      {completedCount}/{subtasks.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="dependencies">
                  Dependências
                  {deps && (deps.blocks.length + deps.blockedBy.length + deps.relatedTo.length) > 0 && (
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      {deps.blocks.length + deps.blockedBy.length + deps.relatedTo.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="subtasks" className="space-y-2">
                <SubtasksList taskId={taskId} />
                <form onSubmit={addSubtask} className="flex gap-2 pt-2">
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
              </TabsContent>

              <TabsContent value="dependencies" className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setDepFormOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Nova dependência
                  </Button>
                </div>
                <DependencyList taskId={taskId} />
                {depFormOpen && (
                  <DependencyForm
                    taskId={taskId}
                    workspaceId={current?.id}
                    excludeTaskIds={existingDepIds}
                    onClose={() => setDepFormOpen(false)}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}

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
                            onClick={() => deleteCommentMut.mutate(c.id)}
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
            <form onSubmit={postComment} className="space-y-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    postComment(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Escreva um comentário... (Ctrl+Enter para enviar)"
                className="min-h-[70px] resize-none text-sm"
              />
              <div className="flex items-center justify-end gap-2">
                {newComment.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewComment("")}
                    disabled={posting}
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={posting || !newComment.trim()}>
                  {posting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Enviando...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-1.5" /> Comentar</>
                  )}
                </Button>
              </div>
            </form>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused-import warning if `toast` not referenced after refactor
void toast;
