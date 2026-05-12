import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MoreVertical, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
  type Comment,
} from "@/hooks/useComments";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CommentItemProps {
  comment: Comment;
  taskId: string;
  currentUserId: string | undefined;
  onReply: (parentId: string) => void;
  depth?: number;
}

function CommentItem({ comment, taskId, currentUserId, onReply, depth = 0 }: CommentItemProps) {
  const updateMut = useUpdateComment(taskId);
  const deleteMut = useDeleteComment(taskId);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.body);
  const [showDelete, setShowDelete] = useState(false);

  const name = comment.author?.display_name || comment.author?.email || "Usuário";
  const initial = name.charAt(0).toUpperCase();
  const mine = comment.author_id === currentUserId;
  const edited = comment.updated_at && comment.updated_at !== comment.created_at;

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        {comment.author?.avatar_url ? (
          <AvatarImage src={comment.author.avatar_url} alt={name} />
        ) : null}
        <AvatarFallback className="text-xs">{initial}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
            {edited ? " (editado)" : ""}
          </span>
          {mine && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>Editar</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDelete(true)}
                  className="text-destructive focus:text-destructive"
                >
                  Deletar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2 mt-1">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  updateMut.mutate(
                    { commentId: comment.id, content: editContent },
                    { onSuccess: () => setIsEditing(false) },
                  );
                }}
                disabled={updateMut.isPending || !editContent.trim()}
              >
                {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.body);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm mt-1 whitespace-pre-wrap break-words">{comment.body}</p>
        )}

        {depth < 2 && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onReply(comment.id)}
          >
            Responder
          </Button>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 ml-1 border-l-2 border-muted pl-4 space-y-4">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                taskId={taskId}
                currentUserId={currentUserId}
                onReply={onReply}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar comentário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As respostas vinculadas também serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate(comment.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface CommentThreadProps {
  taskId: string;
  workspaceId: string | undefined;
}

export function CommentThread({ taskId, workspaceId }: CommentThreadProps) {
  const { user } = useAuth();
  const { data, isLoading } = useComments(taskId);
  const createMut = useCreateComment(taskId, workspaceId);
  const [content, setContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const submit = () => {
    if (!content.trim()) return;
    createMut.mutate(
      { content, parentCommentId: replyingTo },
      {
        onSuccess: () => {
          setContent("");
          setReplyingTo(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder={replyingTo ? "Escrever resposta..." : "Adicionar comentário... (Ctrl+Enter para enviar)"}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          className="text-sm resize-none"
        />
        <div className="flex gap-2 justify-end">
          {replyingTo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReplyingTo(null);
                setContent("");
              }}
            >
              Cancelar resposta
            </Button>
          )}
          <Button size="sm" onClick={submit} disabled={!content.trim() || createMut.isPending}>
            {createMut.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            {replyingTo ? "Responder" : "Comentar"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : data?.comments.length ? (
          data.comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              taskId={taskId}
              currentUserId={user?.id}
              onReply={setReplyingTo}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum comentário ainda. Comece a conversa!
          </p>
        )}
      </div>
    </div>
  );
}
