import { useCallback, useMemo, useRef, useState } from "react";
import {
  Paperclip, Upload, Download, Trash2, Eye, X,
  ChevronLeft, ChevronRight, FileText, FileImage, FileVideo,
  FileAudio, FileArchive, File as FileIcon, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  ATTACHMENTS_BUCKET, createSignedUrl, formatBytes,
  isImageMime, useDeleteAttachment, useTaskAttachments,
  useUploadAttachment, type TaskAttachment,
} from "@/hooks/useTaskAttachments";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

interface Props {
  taskId: string;
  listId?: string;
}

interface UploadProgress {
  id: string;
  filename: string;
  progress: number; // 0-100
  status: "uploading" | "error";
  error?: string;
}

function fileIconFor(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.includes("zip")) return FileArchive;
  if (mime.startsWith("text/") || mime.includes("pdf") || mime.includes("word") || mime.includes("excel") || mime.includes("sheet")) return FileText;
  return FileIcon;
}

async function downloadAttachment(att: TaskAttachment) {
  const url = await createSignedUrl(att.storage_path);
  if (!url) {
    toast.error("Não foi possível gerar o link de download");
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function TaskAttachments({ taskId, listId }: Props) {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const { data: attachments = [], isLoading } = useTaskAttachments(taskId);
  const upload = useUploadAttachment(taskId, listId);
  const del = useDeleteAttachment(taskId, listId);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const imageAtts = useMemo(
    () => attachments.filter((a) => isImageMime(a.mime_type) && a.preview_url),
    [attachments],
  );
  const otherAtts = useMemo(
    () => attachments.filter((a) => !isImageMime(a.mime_type) || !a.preview_url),
    [attachments],
  );

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!user || !current) {
        toast.error("Sessão inválida");
        return;
      }
      const list = Array.from(files);
      // Validate
      const valid: File[] = [];
      for (const f of list) {
        if (f.size > MAX_BYTES) {
          toast.error(`"${f.name}" excede 50MB`);
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;

      // Track progress (Supabase JS doesn't expose granular onProgress;
      // we show indeterminate progress per file).
      const entries: UploadProgress[] = valid.map((f) => ({
        id: crypto.randomUUID(),
        filename: f.name,
        progress: 10,
        status: "uploading",
      }));
      setUploads((prev) => [...prev, ...entries]);

      const results = await Promise.allSettled(
        valid.map(async (file, i) => {
          const entryId = entries[i].id;
          const tick = setInterval(() => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === entryId && u.progress < 90
                  ? { ...u, progress: Math.min(90, u.progress + 10) }
                  : u,
              ),
            );
          }, 250);
          try {
            const res = await upload.mutateAsync({
              file,
              workspaceId: current.id,
              userId: user.id,
            });
            return res;
          } finally {
            clearInterval(tick);
          }
        }),
      );

      // Cleanup progress entries; surface errors per file
      setUploads((prev) => prev.filter((u) => !entries.some((e) => e.id === u.id)));
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          toast.error(`Falha ao enviar "${valid[i].name}": ${msg}`);
        }
      });
    },
    [user, current, upload],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  };

  const handleView = async (att: TaskAttachment, idx: number) => {
    if (isImageMime(att.mime_type)) {
      setLightboxIdx(imageAtts.findIndex((a) => a.id === att.id) >= 0
        ? imageAtts.findIndex((a) => a.id === att.id)
        : idx);
      return;
    }
    if (att.mime_type === "application/pdf") {
      const url = await createSignedUrl(att.storage_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void downloadAttachment(att);
  };

  return (
    <section>
      <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
        <Paperclip className="h-4 w-4" />
        Anexos
        <span className="text-muted-foreground font-normal">({attachments.length})</span>
      </h3>

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "w-full rounded-md border-2 border-dashed p-4 text-center text-xs transition-colors",
          "hover:border-primary/50 hover:bg-muted/30",
          dragOver ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
        <span className="text-muted-foreground">
          Arraste arquivos aqui ou <span className="text-primary font-medium">clique para selecionar</span>
        </span>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Máx 50MB por arquivo</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            void processFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* In-progress uploads */}
      {uploads.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {uploads.map((u) => (
            <div key={u.id} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="truncate flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  {u.filename}
                </span>
                <span className="text-muted-foreground">{u.progress}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${u.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image grid */}
      {imageAtts.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {imageAtts.map((att, i) => (
            <AttachmentThumb
              key={att.id}
              att={att}
              onView={() => handleView(att, i)}
              onDownload={() => void downloadAttachment(att)}
              onDelete={() => setConfirmId(att.id)}
              confirming={confirmId === att.id}
              onCancelConfirm={() => setConfirmId(null)}
              onConfirmDelete={() => {
                del.mutate({ id: att.id, storage_path: att.storage_path });
                setConfirmId(null);
              }}
              canDelete={att.uploaded_by === user?.id}
            />
          ))}
        </div>
      )}

      {/* File list */}
      {otherAtts.length > 0 && (
        <ul className="mt-3 space-y-1">
          {otherAtts.map((att) => (
            <AttachmentRow
              key={att.id}
              att={att}
              onView={() => handleView(att, 0)}
              onDownload={() => void downloadAttachment(att)}
              onDelete={() => setConfirmId(att.id)}
              confirming={confirmId === att.id}
              onCancelConfirm={() => setConfirmId(null)}
              onConfirmDelete={() => {
                del.mutate({ id: att.id, storage_path: att.storage_path });
                setConfirmId(null);
              }}
              canDelete={att.uploaded_by === user?.id}
            />
          ))}
        </ul>
      )}

      {!isLoading && attachments.length === 0 && uploads.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground text-center">Nenhum anexo ainda.</p>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxIdx !== null} onOpenChange={(o) => !o && setLightboxIdx(null)}>
        <DialogContent className="max-w-5xl bg-background/95 p-2">
          {lightboxIdx !== null && imageAtts[lightboxIdx] && (
            <Lightbox
              atts={imageAtts}
              index={lightboxIdx}
              onIndex={setLightboxIdx}
              onClose={() => setLightboxIdx(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AttachmentThumb({
  att, onView, onDownload, onDelete, confirming, onCancelConfirm, onConfirmDelete, canDelete,
}: {
  att: TaskAttachment;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  confirming: boolean;
  onCancelConfirm: () => void;
  onConfirmDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div className="group relative rounded-md overflow-hidden border bg-muted aspect-square">
      <button onClick={onView} className="block h-full w-full">
        {att.preview_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={att.preview_url}
            alt={att.filename}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileImage className="h-8 w-8 mx-auto my-auto text-muted-foreground" />
        )}
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white truncate">{att.filename}</p>
      </div>
      {!confirming ? (
        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn title="Visualizar" onClick={onView}><Eye className="h-3 w-3" /></IconBtn>
          <IconBtn title="Baixar" onClick={onDownload}><Download className="h-3 w-3" /></IconBtn>
          {canDelete && <IconBtn title="Excluir" onClick={onDelete} danger><Trash2 className="h-3 w-3" /></IconBtn>}
        </div>
      ) : (
        <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center p-2 gap-1.5">
          <p className="text-[11px] text-center">Excluir anexo?</p>
          <div className="flex gap-1">
            <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2" onClick={onConfirmDelete}>Excluir</Button>
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={onCancelConfirm}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  att, onView, onDownload, onDelete, confirming, onCancelConfirm, onConfirmDelete, canDelete,
}: {
  att: TaskAttachment;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  confirming: boolean;
  onCancelConfirm: () => void;
  onConfirmDelete: () => void;
  canDelete: boolean;
}) {
  const Icon = fileIconFor(att.mime_type);
  const uploaderName = att.uploader?.display_name || att.uploader?.email || "Usuário";
  return (
    <li className="flex items-center gap-2 group rounded-md hover:bg-muted/40 px-2 py-1.5 border">
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <button onClick={onView} className="text-sm truncate text-left hover:text-primary block w-full">
          {att.filename}
        </button>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Avatar className="h-3.5 w-3.5">
            {att.uploader?.avatar_url && <AvatarImage src={att.uploader.avatar_url} />}
            <AvatarFallback className="text-[8px]">{uploaderName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="truncate">{uploaderName}</span>
          <span>·</span>
          <span>{formatBytes(att.file_size_bytes)}</span>
          <span>·</span>
          <span>{format(new Date(att.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
        </div>
      </div>
      {!confirming ? (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn title="Visualizar" onClick={onView}><Eye className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="Baixar" onClick={onDownload}><Download className="h-3.5 w-3.5" /></IconBtn>
          {canDelete && <IconBtn title="Excluir" onClick={onDelete} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>}
        </div>
      ) : (
        <div className="flex gap-1">
          <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2" onClick={onConfirmDelete}>Excluir</Button>
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={onCancelConfirm}>Cancelar</Button>
        </div>
      )}
    </li>
  );
}

function IconBtn({
  children, onClick, title, danger,
}: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "h-6 w-6 inline-flex items-center justify-center rounded bg-background/80 backdrop-blur border",
        "hover:bg-background transition-colors",
        danger && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function Lightbox({
  atts, index, onIndex, onClose,
}: {
  atts: TaskAttachment[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const att = atts[index];
  const prev = () => onIndex((index - 1 + atts.length) % atts.length);
  const next = () => onIndex((index + 1) % atts.length);
  return (
    <div className="relative" onKeyDown={(e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    }} tabIndex={0}>
      <button
        onClick={onClose}
        className="absolute top-1 right-1 z-10 h-8 w-8 rounded-full bg-background/80 hover:bg-background inline-flex items-center justify-center"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
      {atts.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-background/80 hover:bg-background inline-flex items-center justify-center"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-background/80 hover:bg-background inline-flex items-center justify-center"
            aria-label="Próximo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
      {att.preview_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={att.preview_url}
          alt={att.filename}
          className="max-h-[80vh] mx-auto object-contain"
        />
      )}
      <div className="mt-2 text-center text-xs text-muted-foreground">
        {att.filename} · {index + 1}/{atts.length}
      </div>
    </div>
  );
}

void ATTACHMENTS_BUCKET;
