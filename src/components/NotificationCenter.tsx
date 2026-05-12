import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  subscribeToRealtimeNotifications,
  useGlobalRealtimeUpdates,
  type RealtimeNotification,
} from "@/hooks/useRealtimeUpdates";

const profileCache = new Map<string, string>();

async function resolveActorName(actorId: string | null): Promise<string> {
  if (!actorId) return "Alguém";
  const cached = profileCache.get(actorId);
  if (cached) return cached;
  const { data } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", actorId)
    .maybeSingle();
  const name =
    (data?.display_name as string | null) ||
    (data?.email as string | null) ||
    "Alguém";
  profileCache.set(actorId, name);
  return name;
}

function messageFor(n: RealtimeNotification, actor: string): string {
  switch (n.kind) {
    case "dependency_created":
      return `${actor} criou uma dependência`;
    case "dependency_deleted":
      return `${actor} removeu uma dependência`;
    case "subtask_created":
      return `${actor} criou uma subtask`;
    case "subtask_completed":
      return `${actor} completou uma subtask`;
    case "subtask_uncompleted":
      return `${actor} reabriu uma subtask`;
    case "subtask_updated":
      return `${actor} atualizou uma subtask`;
    case "subtask_deleted":
      return `${actor} removeu uma subtask`;
    default:
      return `${actor} fez uma alteração`;
  }
}

/**
 * Mounts the global realtime listeners and surfaces notifications as toasts.
 * Render once near the app root.
 */
export function NotificationCenter() {
  useGlobalRealtimeUpdates();
  // Track latest notifications for potential UI extensions (badge, drawer).
  const [, setRecent] = useState<RealtimeNotification[]>([]);

  useEffect(() => {
    return subscribeToRealtimeNotifications(async (n) => {
      const actor = await resolveActorName(n.actorId);
      const msg = messageFor(n, actor);
      const ts = formatDistanceToNow(new Date(n.createdAt), {
        addSuffix: true,
        locale: ptBR,
      });
      toast(msg, { description: ts });
      setRecent((prev) => [n, ...prev].slice(0, 50));
    });
  }, []);

  return null;
}
