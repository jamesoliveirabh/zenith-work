import { useEffect } from "react";
import { useEditor, EditorContent, type JSONContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Link as LinkIcon, List, ListOrdered, ListChecks,
  Heading1, Heading2, Heading3,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type { JSONContent };

interface Props {
  content: JSONContent | null;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  /** When provided, pasted/dropped images are uploaded and inserted as an <img> via the returned URL. */
  onImageUpload?: (file: File) => Promise<string | null>;
}

const buildExtensions = (placeholder: string) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
  }),
  Underline,
  Placeholder.configure({ placeholder }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { class: "text-primary underline underline-offset-2" },
  }),
  Image.configure({
    HTMLAttributes: { class: "rounded-md max-w-full h-auto" },
    allowBase64: false,
  }),
];

function ToolbarBtn({
  active, onClick, disabled, children, title,
}: {
  active?: boolean; onClick: () => void; disabled?: boolean;
  children: React.ReactNode; title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-border" />;
}

function promptLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("URL", prev ?? "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

export function RichTextEditor({
  content, onChange, editable = true, placeholder = "Adicione uma descrição...", className,
}: Props) {
  const editor = useEditor({
    extensions: buildExtensions(placeholder),
    content: content ?? "",
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-content focus:outline-none min-h-[80px] px-3 py-2 text-sm leading-relaxed",
          "prose prose-sm max-w-none dark:prose-invert",
          "prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
          "prose-p:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5",
          "prose-a:text-primary",
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  // Sync external content changes (e.g. when switching tasks)
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content ?? { type: "doc", content: [{ type: "paragraph" }] });
    if (current !== next) {
      editor.commands.setContent(content ?? "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  if (!editable) {
    return (
      <div className={cn("rounded-md", className)}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-transparent hover:border-border focus-within:border-border transition-colors bg-background",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 px-2 py-1 border-b flex-wrap">
        <ToolbarBtn
          title="Título 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Título 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Título 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          title="Lista com marcadores"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          title="Link"
          active={editor.isActive("link")}
          onClick={() => promptLink(editor)}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>

      <EditorContent editor={editor} />

      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
      >
        <ToolbarBtn
          title="Negrito"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Itálico"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Sublinhado"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Tachado"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          title="Link"
          active={editor.isActive("link")}
          onClick={() => promptLink(editor)}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </BubbleMenu>
    </div>
  );
}
