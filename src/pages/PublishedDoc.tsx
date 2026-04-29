import { useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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
import { usePublishedDoc } from "@/hooks/useDocs";
import { Loader2, FileText } from "lucide-react";
import { useEffect } from "react";

const lowlight = createLowlight(common);

export default function PublishedDoc() {
  const { token } = useParams<{ token: string }>();
  const { data: doc, isLoading } = usePublishedDoc(token);

  const editor = useEditor({
    editable: false,
    content: (doc?.content as any) ?? null,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false }),
      Underline, TaskList, TaskItem.configure({ nested: true }),
      LinkExt.configure({ openOnClick: true, HTMLAttributes: { class: "text-primary underline" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-md max-w-full h-auto" } }),
      Highlight.configure({ multicolor: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ HTMLAttributes: { class: "border-collapse w-full my-2" } }),
      TableRow,
      TableHeader.configure({ HTMLAttributes: { class: "border bg-muted px-2 py-1 font-medium text-left" } }),
      TableCell.configure({ HTMLAttributes: { class: "border px-2 py-1" } }),
    ],
    editorProps: {
      attributes: { class: "prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none" },
    },
  }, [doc?.id]);

  useEffect(() => {
    if (editor && doc?.content) editor.commands.setContent(doc.content as any);
  }, [editor, doc?.id]);

  if (isLoading) return <div className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  if (!doc) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-muted-foreground">Doc não encontrado ou não publicado</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b py-3 px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" /> Doc compartilhado
        </div>
      </header>
      {doc.cover_url && (
        <img src={doc.cover_url} alt="" className="w-full h-48 object-cover" />
      )}
      <main className="max-w-3xl mx-auto px-8 py-8">
        <div className="flex items-start gap-3 mb-6">
          {doc.icon && <span className="text-5xl leading-none">{doc.icon}</span>}
          <h1 className="text-4xl font-bold">{doc.title}</h1>
        </div>
        <EditorContent editor={editor} />
      </main>
    </div>
  );
}
