import {
  AlertCircle,
  CalendarClock,
  CheckCircle,
  Flag,
  Loader2,
  MessageCircle,
  Pencil,
  UserCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useActivityLog, type ActivityLogEntry } from "@/hooks/useActivityLog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ACTION_META: Record<string, { icon: React.ReactNode; label: string }> = {
  changed_status: { icon: <CheckCircle className="h-3.5 w-3.5" />, label: "mudou o status" },
  changed_priority: { icon: <Flag className="h-3.5 w-3.5" />, label: "mudou a prioridade" },
  changed_due_date: { icon: <CalendarClock className="h-3.5 w-3.5" />, label: "mudou a data" },
  changed_assignee: { icon: <UserCircle className="h-3.5 w-3.5" />, label: "mudou o responsável" },
  changed_title: { icon: <Pencil className="h-3.5 w-3.5" />, label: "renomeou a tarefa" },
  commented: { icon: <MessageCircle className="h-3.5 w-3.5" />, label: "comentou" },
};

function summarize(entry: ActivityLogEntry): string | null {
  const o = entry.old_value ?? {};
  const n = entry.new_value ?? {};
  switch (entry.action) {
    case "changed_priority":
      return `${o.priority ?? "—"} → ${n.priority ?? "—"}`;
    case "changed_due_date":
      return `${o.due_date ?? "—"} → ${n.due_date ?? "—"}`;
    case "changed_title":
      return typeof n.title === "string" ? `"${n.title}"` : null;
    case "commented":
      return typeof n.preview === "string" ? n.preview : null;
    default:
      return null;
  }
}

export function ActivityLog({ taskId }: { taskId: string }) {
  const { data: logs, isLoading } = useActivityLog(taskId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade ainda.</p>
    );
  }

  return (
    <ol className="space-y-3">
      {logs.map((log) => {
        const meta = ACTION_META[log.action] ?? {
          icon: <AlertCircle className="h-3.5 w-3.5" />,
          label: log.action,
        };
        const name = log.author?.display_name || "Sistema";
        const initial = name.charAt(0).toUpperCase();
        const detail = summarize(log);
        return (
          <li key={log.id} className="flex gap-2.5">
            <Avatar className="h-6 w-6 shrink-0">
              {log.author?.avatar_url ? <AvatarImage src={log.author.avatar_url} alt={name} /> : null}
              <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">{meta.icon}</span>
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground">{meta.label}</span>
              </div>
              {detail && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
