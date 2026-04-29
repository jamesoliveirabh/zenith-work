import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

// Stable color hashing — uses HSL on muted palette to fit any theme
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export function TagsInput({ value, onChange, placeholder = "Adicionar tag..." }: Props) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
    if (!t) return;
    if (value.includes(t)) { setDraft(""); return; }
    onChange([...value, t]);
    setDraft("");
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 min-h-9 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
      {value.map((t) => {
        const color = tagColor(t);
        return (
          <Badge
            key={t}
            variant="outline"
            className="font-normal gap-1 pr-1 border"
            style={{ borderColor: `${color}40`, color, backgroundColor: `${color}15` }}
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="hover:opacity-70"
              aria-label={`Remover ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[120px] border-0 shadow-none focus-visible:ring-0 h-6 px-1 text-sm"
      />
    </div>
  );
}
