import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "platform_admin_session_id";

/**
 * Phase P3 — Tracks the current admin's session in platform_admin_sessions.
 * Creates a row at mount, heartbeats every 60s, ends on tab close.
 */
export function useTrackAdminSession() {
  const { user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const existing = sessionStorage.getItem(STORAGE_KEY);
      if (existing) {
        sessionIdRef.current = existing;
        return;
      }
      const { data, error } = await supabase
        .from("platform_admin_sessions")
        .insert({
          user_id: user.id,
          email: user.email ?? null,
          user_agent: navigator.userAgent,
          metadata: { entry: window.location.pathname },
        })
        .select("id")
        .single();
      if (cancelled) return;
      if (!error && data?.id) {
        sessionIdRef.current = data.id;
        sessionStorage.setItem(STORAGE_KEY, data.id);
      }
    })();

    const heartbeat = setInterval(async () => {
      const id = sessionIdRef.current;
      if (!id) return;
      await supabase
        .from("platform_admin_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", id)
        .is("ended_at", null);
    }, 60_000);

    const onUnload = () => {
      const id = sessionIdRef.current;
      if (!id) return;
      // Best-effort end (sendBeacon-like via fetch keepalive)
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/platform_admin_sessions?id=eq.${id}`;
      fetch(url, {
        method: "PATCH",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ ended_at: new Date().toISOString(), ended_reason: "tab_closed" }),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [user?.id]);
}
