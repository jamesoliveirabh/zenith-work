/**
 * Phase P8 — Operations service: alerts + feature flags + kill switch.
 * All RPCs are SECURITY DEFINER and validate is_any_platform_admin server-side.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

export interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  details: Record<string, unknown>;
  status: "open" | "acknowledged" | "resolved";
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}
export interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export async function listAlerts(status?: string) {
  const { data, error } = await rpc("platform_admin_alerts_list", {
    _status: status ?? null,
    _limit: 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AlertRow[];
}
export async function checkAlerts() {
  const { data, error } = await rpc("platform_admin_alerts_check", {});
  if (error) throw new Error(error.message);
  return (data?.[0]?.created ?? 0) as number;
}
export async function ackAlert(id: string) {
  const { error } = await rpc("platform_admin_alert_ack", { _id: id });
  if (error) throw new Error(error.message);
}
export async function resolveAlert(id: string, note: string) {
  if (note.trim().length < 3) throw new Error("Justificativa muito curta");
  const { error } = await rpc("platform_admin_alert_resolve", { _id: id, _note: note });
  if (error) throw new Error(error.message);
}
export async function listFlags() {
  const { data, error } = await rpc("platform_admin_flag_list", {});
  if (error) throw new Error(error.message);
  return (data ?? []) as FlagRow[];
}
export async function setFlag(key: string, enabled: boolean, reason: string) {
  if (reason.trim().length < 3) throw new Error("Justificativa obrigatória");
  const { error } = await rpc("platform_admin_flag_set", {
    _key: key,
    _enabled: enabled,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}
