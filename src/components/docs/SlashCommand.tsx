import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance, type GetReferenceClientRect } from "tippy.js";
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks,
  Quote, Code, Minus, Image as ImageIcon, Table as TableIcon, AtSign,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

export interface SlashItem {
  title: string;
  description: string;
  icon: any;
  keywords: string[];
  command: (editor: Editor) => void;
}

const ITEMS: SlashItem[] = [
  { title: "Título 1", description: "Cabeçalho grande", icon: Heading1, keywords: ["h1", "heading", "titulo"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleHeading({ level: 1 }).run() },
  { title: "Título 2", description: "Cabeçalho médio", icon: Heading2, keywords: ["h2", "heading"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleHeading({ level: 2 }).run() },
  { title: "Título 3", description: "Cabeçalho pequeno", icon: Heading3, keywords: ["h3", "heading"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleHeading({ level: 3 }).run() },
  { title: "Lista com marcadores", description: "Lista simples", icon: List, keywords: ["bullet", "ul", "list"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleBulletList().run() },
  { title: "Lista numerada", description: "1, 2, 3...", icon: ListOrdered, keywords: ["numbered", "ol"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleOrderedList().run() },
  { title: "Checklist", description: "Lista de tarefas", icon: ListChecks, keywords: ["check", "todo", "task"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleTaskList().run() },
  { title: "Citação", description: "Quote block", icon: Quote, keywords: ["quote", "blockquote"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleBlockquote().run() },
  { title: "Bloco de código", description: "Código com syntax highlight", icon: Code, keywords: ["code", "pre"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleCodeBlock().run() },
  { title: "Divisor", description: "Linha horizontal", icon: Minus, keywords: ["divider", "hr", "rule"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).setHorizontalRule().run() },
  { title: "Imagem", description: "Upload de imagem", icon: ImageIcon, keywords: ["image", "img", "foto"],
    command: (e) => {
      e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).run();
      const ev = new CustomEvent("doc-editor:image-upload");
      window.dispatchEvent(ev);
    },
  },
  { title: "Tabela", description: "Tabela 3x3", icon: TableIcon, keywords: ["table"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from })
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Mencionar tarefa", description: "Vincular uma tarefa", icon: AtSign, keywords: ["task", "mention"],
    command: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).insertContent("@").run() },
];

const SlashMenu = forwardRef<any, { items: SlashItem[]; command: (item: SlashItem) => void }>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);
    useEffect(() => setSelected(0), [items]);
    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: any) => {
        if (event.key === "ArrowDown") { setSelected((s) => (s + 1) % items.length); return true; }
        if (event.key === "ArrowUp") { setSelected((s) => (s - 1 + items.length) % items.length); return true; }
        if (event.key === "Enter") { command(items[selected]); return true; }
        return false;
      },
    }));
    if (!items.length) return null;
    return (
      <div className="bg-popover border rounded-lg shadow-lg max-h-72 overflow-auto w-72 p-1">
        {items.map((it, i) => (
          <button
            key={it.title}
            onClick={() => command(it)}
            onMouseEnter={() => setSelected(i)}
            className={`w-full flex items-center gap-2 p-2 rounded text-left text-sm ${i === selected ? "bg-muted" : ""}`}
          >
            <it.icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">{it.title}</div>
              <div className="text-xs text-muted-foreground truncate">{it.description}</div>
            </div>
          </button>
        ))}
      </div>
    );
  },
);

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({ editor, props }: any) => {
          (props.item as SlashItem).command(editor);
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return ITEMS.filter((it) =>
            !q || it.title.toLowerCase().includes(q) || it.keywords.some((k) => k.includes(q))
          ).slice(0, 10);
        },
        render: () => {
          let component: ReactRenderer;
          let popup: Instance[];
          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: (item: SlashItem) => props.command({ item }) },
                editor: props.editor,
              });
              popup = tippy("body", {
                getReferenceClientRect: props.clientRect as GetReferenceClientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate(props: any) {
              component.updateProps({ items: props.items, command: (item: SlashItem) => props.command({ item }) });
              popup[0].setProps({ getReferenceClientRect: props.clientRect as GetReferenceClientRect });
            },
            onKeyDown(props: any) {
              if (props.event.key === "Escape") { popup[0].hide(); return true; }
              return component.ref?.onKeyDown?.(props);
            },
            onExit() { popup[0].destroy(); component.destroy(); },
          };
        },
      }),
    ];
  },
});
