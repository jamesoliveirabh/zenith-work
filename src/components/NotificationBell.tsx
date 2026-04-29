import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    if (!user || !current) return;
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,link_path,is_read,created_at")
      .eq("workspace_id", current.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data ?? []);
    setUnread((data ?? []).filter((n) => !n.is_read).length);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, current?.id]);

  useEffect(() => {
    if (!user || !current) return;
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line
  }, [user?.id, current?.id]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };

  const markAllRead = async () => {
    if (!current) return;
    const { error } = await supabase.rpc("mark_all_notifications_read", { _workspace_id: current.id });
    if (error) toast.error(error.message);
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
  };

  const clickItem = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    if (n.link_path) navigate(n.link_path);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-medium">Notificações</div>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar tudo
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação ainda.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "group flex gap-2 px-3 py-2.5 hover:bg-accent/40 cursor-pointer transition-colors",
                    !n.is_read && "bg-accent/20",
                  )}
                  onClick={() => clickItem(n)}
                >
                  <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{
                    background: n.is_read ? "transparent" : "hsl(var(--primary))",
                  }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-start gap-0.5">
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                        className="p-1 rounded hover:bg-accent"
                        aria-label="Marcar como lida"
                      ><Check className="h-3.5 w-3.5" /></button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground"
                      aria-label="Remover"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
