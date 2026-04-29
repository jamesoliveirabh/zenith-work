import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { generateText } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import LinkExt from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

import {
  ArrowLeft, Bold, Italic, Underline as UIcon, Strikethrough, List, ListOrdered,
  ListChecks, Link as LinkIcon, Image as ImageIcon, Code, Quote, Heading1, Heading2,
  Heading3, Undo2, Redo2, Highlighter, Globe, Copy, Trash2, Smile, Image as CoverIcon,
  X, Loader2, Plus, Users, Info, Link2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useDocDetail, useUpdateDoc, useDeleteDoc, usePublishDoc,
  useDocTaskLinks, useLinkTask, useUnlinkTask,
  useDocMembers, useAddDocMember, useUpdateDocMember, useRemoveDocMember,
} from "@/hooks/useDocs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

import { SlashCommand } from "@/components/docs/SlashCommand";
import { createTaskMention } from "@/components/docs/TaskMention";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";

const EMOJIS = ["📄","📝","📚","💡","🎯","🚀","⚡","🔥","🌟","✅","📊","🗂️","🛠️","🎨","💼","🧠","🔖","📌","🏷️","🌍","💬","📅"];
const lowlight = createLowlight(common);

async function uploadDocImage(workspaceId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("doc-images").upload(path, file);
  if (error) { toast.error(error.message); return null; }
  const { data } = supabase.storage.from("doc-images").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadDocCover(workspaceId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("doc-covers").upload(path, file);
  if (error) { toast.error(error.message); return null; }
  const { data } = supabase.storage.from("doc-covers").getPublicUrl(path);
  return data.publicUrl;
}

export default function DocEditor() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const { data: doc, isLoading } = useDocDetail(docId);
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const publishDoc = usePublishDoc();
  const { data: taskLinks = [] } = useDocTaskLinks(docId);
  const linkTask = useLinkTask(docId!);
  const unlinkTask = useUnlinkTask();
  const { data: members = [] } = useDocMembers(docId);
  const addMember = useAddDocMember(docId!);
  const updateMember = useUpdateDocMember();
  const removeMember = useRemoveDocMember();

  const [title, setTitle] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const titleTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { if (doc) setTitle(doc.title); }, [doc?.id]);

  const extensions = useMemo(() => {
    if (!current) return [];
    return [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false }),
      Underline,
      Placeholder.configure({ placeholder: "Digite '/' para comandos..." }),
      TaskList, TaskItem.configure({ nested: true }),
      LinkExt.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "text-primary underline" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-md max-w-full h-auto" } }),
      Highlight.configure({ multicolor: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "border-collapse w-full my-2" } }),
      TableRow,
      TableHeader.configure({ HTMLAttributes: { class: "border bg-muted px-2 py-1 font-medium text-left" } }),
      TableCell.configure({ HTMLAttributes: { class: "border px-2 py-1" } }),
      SlashCommand,
      createTaskMention(current.id, (taskId) => {
        if (current) linkTask.mutate({ task_id: taskId, workspace_id: current.id });
      }),
    ];
  }, [current?.id]);

  const editor = useEditor({
    extensions,
    content: doc?.content ?? null,
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none min-h-[400px]",
      },
      handleDrop: (view, event) => {
        const files = (event.dataTransfer?.files ?? []) as unknown as FileList;
        if (files?.length && files[0].type.startsWith("image/") && current) {
          event.preventDefault();
          uploadDocImage(current.id, files[0]).then((url) => {
            if (url) editor?.chain().focus().setImage({ src: url }).run();
          });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaving(true);
      saveTimer.current = setTimeout(async () => {
        const json = editor.getJSON();
        let text = "";
        try {
          text = generateText(json, extensions as any);
        } catch { /* noop */ }
        await updateDoc.mutateAsync({ id: docId!, content: json, content_text: text });
        setSavedAt(new Date());
        setSaving(false);
      }, 1000);
    },
  }, [docId, extensions.length]);

  // Reset content when doc loaded/changed
  useEffect(() => {
    if (editor && doc && !editor.getText() && doc.content) {
      editor.commands.setContent(doc.content as JSONContent);
    }
  }, [editor, doc?.id]);

  // Click on task mention → open dialog
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const mention = t.closest('span[data-mention-type="task"]') as HTMLElement | null;
      if (mention) {
        const id = mention.getAttribute("data-task-id");
        if (id) setOpenTaskId(id);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Slash → image upload event
  useEffect(() => {
    const handler = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file && current) {
          const url = await uploadDocImage(current.id, file);
          if (url) editor?.chain().focus().setImage({ src: url }).run();
        }
      };
      input.click();
    };
    window.addEventListener("doc-editor:image-upload", handler);
    return () => window.removeEventListener("doc-editor:image-upload", handler);
  }, [editor, current]);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      updateDoc.mutate({ id: docId!, title: v.trim() || "Sem título" });
    }, 600);
  };

  const handleCoverUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file && current) {
        const url = await uploadDocCover(current.id, file);
        if (url) updateDoc.mutate({ id: docId!, cover_url: url });
      }
    };
    input.click();
  };

  if (isLoading || !doc || !editor) {
    return <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  }

  const publicUrl = `${window.location.origin}/p/${doc.published_token}`;
  const memberIds = new Set(members.map((m) => m.user_id));

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex-1 overflow-auto">
        {/* Cover */}
        {doc.cover_url ? (
          <div className="relative h-48 group">
            <img src={doc.cover_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleCoverUpload}>Mudar capa</Button>
              <Button size="sm" variant="secondary" onClick={() => updateDoc.mutate({ id: docId!, cover_url: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="max-w-3xl mx-auto px-8 pt-6 pb-20">
          <Button variant="ghost" size="sm" onClick={() => navigate("/docs")} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>

          {/* Toolbar add cover/icon */}
          {(!doc.cover_url || !doc.icon) && (
            <div className="flex gap-2 mb-4">
              {!doc.icon && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-muted-foreground"><Smile className="h-4 w-4 mr-1" /> Adicionar ícone</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2"><EmojiPicker onPick={(e) => updateDoc.mutate({ id: docId!, icon: e })} /></PopoverContent>
                </Popover>
              )}
              {!doc.cover_url && (
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleCoverUpload}>
                  <CoverIcon className="h-4 w-4 mr-1" /> Adicionar capa
                </Button>
              )}
            </div>
          )}

          {/* Icon + title */}
          <div className="flex items-start gap-3 mb-4">
            {doc.icon && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-5xl leading-none">{doc.icon}</button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2">
                  <EmojiPicker onPick={(e) => updateDoc.mutate({ id: docId!, icon: e })} />
                  <Button size="sm" variant="ghost" className="w-full mt-2" onClick={() => updateDoc.mutate({ id: docId!, icon: null })}>Remover</Button>
                </PopoverContent>
              </Popover>
            )}
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Sem título"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editor.commands.focus(); } }}
              className="text-4xl font-bold border-none px-0 focus-visible:ring-0 h-auto bg-transparent"
            />
          </div>

          {/* Save indicator */}
          <div className="text-xs text-muted-foreground mb-4">
            {saving ? "Salvando..." : savedAt ? `Salvo ${formatDistanceToNow(savedAt, { locale: ptBR, addSuffix: true })}` : "Pronto"}
          </div>

          {/* Toolbar */}
          <div className="sticky top-0 z-10 bg-background border-b py-2 mb-4 flex items-center gap-1 flex-wrap">
            <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}><Heading1 className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}><Heading2 className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}><Heading3 className="h-4 w-4" /></ToolbarBtn>
            <Sep />
            <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><UIcon className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><Strikethrough className="h-4 w-4" /></ToolbarBtn>
            <Sep />
            <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")}><ListChecks className="h-4 w-4" /></ToolbarBtn>
            <Sep />
            <ToolbarBtn onClick={() => {
              const url = window.prompt("URL", editor.getAttributes("link").href ?? "https://");
              if (url === null) return;
              if (url === "") editor.chain().focus().unsetLink().run();
              else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            }} active={editor.isActive("link")}><LinkIcon className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={handleCoverUpload}><ImageIcon className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}><Quote className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}><Code className="h-4 w-4" /></ToolbarBtn>
            <Sep />
            <ToolbarBtn onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarBtn>
          </div>

          <BubbleMenu editor={editor} className="bg-popover border rounded-lg shadow-lg p-1 flex items-center gap-1">
            <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><UIcon className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><Strikethrough className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()} active={editor.isActive("highlight")}><Highlighter className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => {
              const url = window.prompt("URL", "https://");
              if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            }}><LinkIcon className="h-4 w-4" /></ToolbarBtn>
          </BubbleMenu>

          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Side panel */}
      <aside className="w-80 border-l bg-card overflow-auto shrink-0 hidden lg:block">
        <Tabs defaultValue="info" className="p-4">
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1"><Info className="h-3.5 w-3.5 mr-1" /> Info</TabsTrigger>
            <TabsTrigger value="tasks" className="flex-1"><Link2 className="h-3.5 w-3.5 mr-1" /> Tarefas</TabsTrigger>
            <TabsTrigger value="members" className="flex-1"><Users className="h-3.5 w-3.5 mr-1" /> Membros</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="text-xs text-muted-foreground space-y-2">
              <div>Criado em {new Date(doc.created_at).toLocaleString("pt-BR")}</div>
              <div>Editado {formatDistanceToNow(new Date(doc.updated_at), { locale: ptBR, addSuffix: true })}</div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2"><Globe className="h-4 w-4" /> Publicar doc</span>
                <Switch checked={doc.is_published} onCheckedChange={(v) => publishDoc.mutate({ id: doc.id, published: v })} />
              </div>
              {doc.is_published && (
                <div className="flex gap-2 items-center">
                  <Input value={publicUrl} readOnly className="text-xs" />
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copiado"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="border-t pt-4">
              <Button size="sm" variant="destructive" className="w-full" onClick={() => {
                if (confirm("Deletar este doc e todos os filhos?")) {
                  deleteDoc.mutate(doc.id);
                  navigate("/docs");
                }
              }}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Deletar doc
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-2 mt-4">
            <TaskLinker workspaceId={current?.id} onLink={(t) => linkTask.mutate({ task_id: t, workspace_id: current!.id })} />
            {taskLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">Nenhuma tarefa vinculada</p>
            ) : taskLinks.map((tl: any) => (
              <div key={tl.task_id} className="flex items-center gap-2 border rounded p-2 hover:bg-muted">
                <button onClick={() => setOpenTaskId(tl.task_id)} className="text-sm flex-1 text-left truncate">
                  {tl.tasks?.title ?? "Tarefa"}
                </button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => unlinkTask.mutate({ doc_id: doc.id, task_id: tl.task_id })}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="members" className="space-y-2 mt-4">
            <MemberAdder workspaceId={current?.id} excludeIds={memberIds} onAdd={(uid, perm) => addMember.mutate({ user_id: uid, permission: perm })} />
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">Nenhum membro adicional</p>
            ) : members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 border rounded p-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{(m.profile?.display_name ?? m.profile?.email ?? "?")[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm flex-1 truncate">{m.profile?.display_name ?? m.profile?.email}</span>
                <Select value={m.permission} onValueChange={(v) => updateMember.mutate({ doc_id: doc.id, user_id: m.user_id, permission: v as any })}>
                  <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="comment">Comment</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeMember.mutate({ doc_id: doc.id, user_id: m.user_id })}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </aside>

      {openTaskId && (
        <TaskDetailDialog
          taskId={openTaskId}
          open={!!openTaskId}
          onOpenChange={(o) => !o && setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

function ToolbarBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground")}
    >
      {children}
    </button>
  );
}
function Sep() { return <span className="mx-0.5 h-4 w-px bg-border" />; }

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {EMOJIS.map((e) => (
        <button key={e} onClick={() => onPick(e)} className="text-xl hover:bg-muted rounded p-1">{e}</button>
      ))}
    </div>
  );
}

function TaskLinker({ workspaceId, onLink }: { workspaceId?: string; onLink: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!workspaceId || !q) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("tasks").select("id, title").eq("workspace_id", workspaceId).ilike("title", `%${q}%`).limit(6);
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, workspaceId]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="w-full"><Plus className="h-3.5 w-3.5 mr-2" /> Vincular tarefa</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <Input placeholder="Buscar tarefa..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="mt-2 space-y-1">
          {results.map((r) => (
            <button key={r.id} onClick={() => { onLink(r.id); setQ(""); }} className="w-full text-left p-2 rounded hover:bg-muted text-sm">{r.title}</button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MemberAdder({ workspaceId, excludeIds, onAdd }: { workspaceId?: string; excludeIds: Set<string>; onAdd: (uid: string, perm: any) => void }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      const { data: m } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId);
      const ids = (m ?? []).map((x) => x.user_id);
      if (!ids.length) return;
      const { data: p } = await supabase.from("profiles").select("id, display_name, avatar_url, email").in("id", ids);
      setProfiles(p ?? []);
    })();
  }, [workspaceId]);
  const candidates = profiles.filter((p) => !excludeIds.has(p.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="w-full"><Plus className="h-3.5 w-3.5 mr-2" /> Adicionar membro</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-72 overflow-auto">
        {candidates.length === 0 ? <p className="text-sm text-muted-foreground p-2">Nenhum disponível</p> :
          candidates.map((p) => (
            <button key={p.id} onClick={() => onAdd(p.id, "edit")} className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left text-sm">
              <Avatar className="h-6 w-6"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{(p.display_name ?? "?")[0]}</AvatarFallback></Avatar>
              <span className="truncate">{p.display_name ?? p.email}</span>
            </button>
          ))}
      </PopoverContent>
    </Popover>
  );
}
