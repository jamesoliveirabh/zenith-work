import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance, type GetReferenceClientRect } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TaskItem { id: string; title: string; list_id: string }

const TaskMentionList = forwardRef<any, { items: TaskItem[]; command: (item: TaskItem) => void }>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);
    useEffect(() => setSelected(0), [items]);
    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: any) => {
        if (event.key === "ArrowDown") { setSelected((s) => (s + 1) % Math.max(items.length, 1)); return true; }
        if (event.key === "ArrowUp") { setSelected((s) => (s - 1 + items.length) % Math.max(items.length, 1)); return true; }
        if (event.key === "Enter" && items[selected]) { command(items[selected]); return true; }
        return false;
      },
    }));
    return (
      <div className="bg-popover border rounded-lg shadow-lg w-72 max-h-60 overflow-auto p-1">
        {items.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">Nenhuma tarefa encontrada</div>
        ) : items.map((it, i) => (
          <button
            key={it.id}
            onClick={() => command(it)}
            onMouseEnter={() => setSelected(i)}
            className={`w-full text-left px-2 py-1.5 rounded text-sm ${i === selected ? "bg-muted" : ""}`}
          >
            {it.title}
          </button>
        ))}
      </div>
    );
  },
);

export function createTaskMention(workspaceId: string, onLink: (taskId: string) => void) {
  return Mention.extend({
    addAttributes() {
      return {
        id: { default: null },
        label: { default: null },
        listId: { default: null },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-mention-type="task"]' }];
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        "span",
        {
          ...HTMLAttributes,
          "data-mention-type": "task",
          "data-task-id": node.attrs.id,
          "data-list-id": node.attrs.listId,
          class: "inline-flex items-center gap-1 bg-primary/10 text-primary rounded px-1.5 py-0.5 text-sm font-medium cursor-pointer hover:bg-primary/20",
        },
        `@${node.attrs.label ?? "tarefa"}`,
      ];
    },
  }).configure({
    HTMLAttributes: {},
    suggestion: {
      char: "@",
      command: ({ editor, range, props }: any) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: "mention", attrs: { id: props.id, label: props.label, listId: props.listId } },
            { type: "text", text: " " },
          ])
          .run();
        onLink(props.id);
      },
      items: async ({ query }: { query: string }) => {
        if (!workspaceId) return [];
        const { data } = await supabase
          .from("tasks")
          .select("id, title, list_id")
          .eq("workspace_id", workspaceId)
          .ilike("title", `%${query}%`)
          .limit(8);
        return (data ?? []).map((t) => ({ id: t.id, title: t.title, listId: t.list_id, label: t.title }));
      },
      render: () => {
        let component: ReactRenderer;
        let popup: Instance[];
        return {
          onStart: (props: any) => {
            component = new ReactRenderer(TaskMentionList, {
              props: { items: props.items, command: (it: any) => props.command(it) },
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
            component.updateProps({ items: props.items, command: (it: any) => props.command(it) });
            popup[0].setProps({ getReferenceClientRect: props.clientRect as GetReferenceClientRect });
          },
          onKeyDown(props: any) {
            if (props.event.key === "Escape") { popup[0].hide(); return true; }
            return (component.ref as any)?.onKeyDown?.(props);
          },
          onExit() { popup[0].destroy(); component.destroy(); },
        };
      },
    },
  });
}
