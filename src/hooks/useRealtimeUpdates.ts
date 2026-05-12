import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  taskDependenciesKey,
  blockedByChainKey,
} from "./useTaskDependencies";
import { subtasksKey, subtaskProgressKey } from "./useSubtasks";

// ---------- Notification bus -----------------------------------------------

export type RealtimeEventKind =
  | "dependency_created"
  | "dependency_deleted"
  | "subtask_created"
  | "subtask_completed"
  | "subtask_uncompleted"
  | "subtask_updated"
  | "subtask_deleted";

export interface RealtimeNotification {
  id: string;
  kind: RealtimeEventKind;
  taskId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

type Listener = (n: RealtimeNotification) => void;
const listeners = new Set<Listener>();

export function subscribeToRealtimeNotifications(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(n: RealtimeNotification) {
  for (const l of listeners) l(n);
}

// ---------- Global realtime updater ----------------------------------------

interface DependencyRow {
  id: string;
  source_task_id: string;
  target_task_id: string;
  dependency_type: string;
  created_by: string | null;
  workspace_id?: string | null;
}

interface SubtaskRow {
  id: string;
  task_id: string;
  is_completed: boolean;
  title: string;
  created_by?: string | null;
}

/**
 * Mounts a single global subscription that invalidates React Query caches
 * for dependencies and subtasks, and broadcasts notifications to listeners.
 *
 * Mount once near the app root (after AuthProvider).
 */
export function useGlobalRealtimeUpdates() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  useEffect(() => {
    const channel = supabase
      .channel("realtime:dep+subtasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_dependencies" },
        (payload: RealtimePostgresChangesPayload<DependencyRow>) => {
          const row =
            (payload.new as DependencyRow | undefined) ??
            (payload.old as DependencyRow | undefined);
          if (!row) return;
          for (const id of [row.source_task_id, row.target_task_id]) {
            if (!id) continue;
            qc.invalidateQueries({ queryKey: taskDependenciesKey(id) });
            qc.invalidateQueries({ queryKey: blockedByChainKey(id) });
          }

          const actor = (payload.new as DependencyRow | undefined)?.created_by ?? null;
          if (actor && actor === userIdRef.current) return; // skip own actions

          if (payload.eventType === "INSERT") {
            emit({
              id: `dep-ins-${row.id}-${Date.now()}`,
              kind: "dependency_created",
              taskId: row.source_task_id,
              actorId: actor,
              payload: { row: payload.new },
              createdAt: new Date().toISOString(),
            });
          } else if (payload.eventType === "DELETE") {
            emit({
              id: `dep-del-${row.id}-${Date.now()}`,
              kind: "dependency_deleted",
              taskId: row.source_task_id,
              actorId: null,
              payload: { row: payload.old },
              createdAt: new Date().toISOString(),
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_subtasks" },
        (payload: RealtimePostgresChangesPayload<SubtaskRow>) => {
          const row =
            (payload.new as SubtaskRow | undefined) ??
            (payload.old as SubtaskRow | undefined);
          if (!row?.task_id) return;
          qc.invalidateQueries({ queryKey: subtasksKey(row.task_id) });
          qc.invalidateQueries({ queryKey: subtaskProgressKey(row.task_id) });

          const actor = (payload.new as SubtaskRow | undefined)?.created_by ?? null;

          if (payload.eventType === "INSERT") {
            if (actor && actor === userIdRef.current) return;
            emit({
              id: `st-ins-${row.id}-${Date.now()}`,
              kind: "subtask_created",
              taskId: row.task_id,
              actorId: actor,
              payload: { row: payload.new },
              createdAt: new Date().toISOString(),
            });
          } else if (payload.eventType === "UPDATE") {
            const prev = payload.old as SubtaskRow | undefined;
            const next = payload.new as SubtaskRow | undefined;
            if (!prev || !next) return;
            if (prev.is_completed !== next.is_completed) {
              emit({
                id: `st-toggle-${next.id}-${Date.now()}`,
                kind: next.is_completed ? "subtask_completed" : "subtask_uncompleted",
                taskId: next.task_id,
                actorId: null,
                payload: { row: next },
                createdAt: new Date().toISOString(),
              });
            } else {
              emit({
                id: `st-upd-${next.id}-${Date.now()}`,
                kind: "subtask_updated",
                taskId: next.task_id,
                actorId: null,
                payload: { row: next },
                createdAt: new Date().toISOString(),
              });
            }
          } else if (payload.eventType === "DELETE") {
            emit({
              id: `st-del-${row.id}-${Date.now()}`,
              kind: "subtask_deleted",
              taskId: row.task_id,
              actorId: null,
              payload: { row: payload.old },
              createdAt: new Date().toISOString(),
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

// ---------- Per-task presence ----------------------------------------------

export interface PresenceUser {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  online_at: string;
}

/**
 * Tracks who is currently viewing a given task using Supabase Presence.
 * Returns the list of OTHER users currently watching (excludes self).
 */
export function useTaskPresence(taskId: string | null | undefined) {
  const { user } = useAuth();
  const [viewers, setViewers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!taskId || !user) {
      setViewers([]);
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      // Fetch own profile metadata for richer presence payload.
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      channel = supabase.channel(`presence:task:${taskId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState<PresenceUser>();
          const flat: PresenceUser[] = [];
          for (const [key, metas] of Object.entries(state)) {
            if (key === user.id) continue;
            const meta = metas[0];
            if (meta) flat.push(meta);
          }
          setViewers(flat);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({
              userId: user.id,
              displayName: profile?.display_name ?? null,
              avatarUrl: profile?.avatar_url ?? null,
              online_at: new Date().toISOString(),
            } satisfies PresenceUser);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      setViewers([]);
    };
  }, [taskId, user?.id]);

  return viewers;
}
