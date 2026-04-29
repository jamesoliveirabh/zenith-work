import { useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface AssigneeMember {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
}

interface Props {
  members: AssigneeMember[];
  selectedIds: string[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  maxVisible?: number;
  size?: "sm" | "md";
  disabled?: boolean;
}

function initials(m: AssigneeMember): string {
  const name = m.display_name || m.email || "?";
  return name.charAt(0).toUpperCase();
}

function nameOf(m: AssigneeMember): string {
  return m.display_name || m.email?.split("@")[0] || "Usuário";
}

export function AssigneeSelect({
  members, selectedIds, onAdd, onRemove, maxVisible = 3, size = "sm", disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const px = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs";
  const overlap = size === "sm" ? "-ml-2" : "-ml-2.5";

  const selected = selectedIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is AssigneeMember => !!m);

  const visible = selected.slice(0, maxVisible);
  const extra = selected.length - visible.length;

  const filtered = members.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.display_name ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {visible.map((m, i) => (
          <div key={m.id} className={cn("relative group", i > 0 && overlap)}>
            <Avatar className={cn(px, "ring-2 ring-background")}>
              {m.avatar_url && <AvatarImage src={m.avatar_url} alt={nameOf(m)} />}
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {initials(m)}
              </AvatarFallback>
            </Avatar>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(m.id); }}
                className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground"
                aria-label={`Remover ${nameOf(m)}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}
        {extra > 0 && (
          <div className={cn("relative flex items-center justify-center rounded-full bg-muted ring-2 ring-background font-medium text-muted-foreground", px, overlap)}>
            +{extra}
          </div>
        )}
      </div>

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-full border border-dashed text-muted-foreground hover:text-foreground",
                size === "sm" ? "h-6 w-6" : "h-7 w-7",
                selected.length > 0 && overlap,
              )}
              aria-label="Adicionar responsável"
            >
              <UserPlus className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar membro..."
                  className="h-8 pl-8"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Nenhum membro encontrado
                </div>
              ) : (
                filtered.map((m) => {
                  const isSelected = selectedIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) onRemove(m.id);
                        else onAdd(m.id);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/60 text-left"
                    >
                      <Avatar className="h-6 w-6">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} alt={nameOf(m)} />}
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {initials(m)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate">{nameOf(m)}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
