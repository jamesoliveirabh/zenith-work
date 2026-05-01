import { supabase } from "@/integrations/supabase/client";

export type PlatformAdminEvent =
  | "login"
  | "logout"
  | "access_denied"
  | "login_attempt"
  | "navigate";

/**
 * Phase P0 — record a platform admin audit event via SECURITY DEFINER RPC.
 * Failures are swallowed (auditing must never break UX) but logged to console.
 */
export async function logPlatformAdminEvent(
  event: PlatformAdminEvent | string,
  opts: { route?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_platform_admin_event", {
      _event: event,
      _route: opts.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
      _metadata: (opts.metadata ?? {}) as never,
    });
    if (error && import.meta.env.DEV) {
      console.warn("[platform-admin-audit] failed:", error.message);
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[platform-admin-audit] threw:", err);
  }
}
