import type { JSONContent } from "@tiptap/react";

export function tiptapToText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  if ("text" in doc && typeof doc.text === "string") return doc.text;
  const children = (doc as JSONContent).content ?? [];
  return children.map((c) => tiptapToText(c)).join(" ").replace(/\s+/g, " ").trim();
}
