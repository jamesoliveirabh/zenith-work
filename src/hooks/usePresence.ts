import { useTaskPresence, type PresenceUser } from "./useRealtimeUpdates";

export interface PresentUser {
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  last_seen: number;
}

/**
 * Tracks who is currently viewing a given task.
 * Thin adapter around `useTaskPresence` with a stable, snake_case shape
 * suited for `<AvatarGroup />` and other presence consumers.
 *
 * Returns OTHER viewers (excludes self).
 */
export function usePresence(taskId: string | null | undefined): PresentUser[] {
  const viewers = useTaskPresence(taskId);
  return viewers.map((v: PresenceUser) => ({
    user_id: v.userId,
    user_name: v.displayName ?? "Usuário",
    avatar_url: v.avatarUrl ?? null,
    last_seen: new Date(v.online_at).getTime(),
  }));
}
