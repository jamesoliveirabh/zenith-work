/**
 * Phase P3 — Platform-admin governance service.
 * All RPCs validate role server-side via has_platform_role().
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

export type PlatformRole =
  | "platform_owner"
  | "finance_admin"
  | "support_admin"
  | "security_admin";

export interface AdminRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_disabled: boolean;
  mfa_required: boolean;
  roles: string[];
  created_at: string | null;
  last_seen_at: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  ended_reason: string | null;
}

export interface AuditRow {
  id: string;
  admin_user_id: string | null;
  email: string | null;
  event: string;
  route: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  total_count: number;
}

export interface PlatformSettings {
  mfa_enforcement_enabled: boolean;
  updated_at: string | null;
}

export async function listAdmins(): Promise<AdminRow[]> {
  const { data, error } = await rpc("platform_admin_list_admins");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminRow[];
}

export async function grantRole(input: { userId: string; role: PlatformRole; reason: string }) {
  const { error } = await rpc("platform_admin_grant_role", {
    _target_user: input.userId, _role: input.role, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}

export async function revokeRole(input: { userId: string; role: PlatformRole; reason: string }) {
  const { error } = await rpc("platform_admin_revoke_role", {
    _target_user: input.userId, _role: input.role, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}

export async function setDisabled(input: { userId: string; disabled: boolean; reason: string }) {
  const { error } = await rpc("platform_admin_set_disabled", {
    _target_user: input.userId, _disabled: input.disabled, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}

export async function listSessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("platform_admin_sessions")
    .select("id,user_id,email,ip,user_agent,started_at,last_seen_at,ended_at,ended_reason")
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionRow[];
}

export async function revokeSession(input: { sessionId: string; reason: string }) {
  const { error } = await rpc("platform_admin_revoke_session", {
    _session_id: input.sessionId, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}

export async function listAudit(input: {
  search?: string; event?: string; page?: number; pageSize?: number;
}): Promise<AuditRow[]> {
  const page = input.page ?? 0;
  const pageSize = input.pageSize ?? 50;
  const { data, error } = await rpc("platform_admin_list_audit", {
    _search: input.search ?? null,
    _event: input.event ?? null,
    _limit: pageSize,
    _offset: page * pageSize,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}

export async function getSettings(): Promise<PlatformSettings | null> {
  const { data, error } = await supabase
    .from("platform_admin_settings")
    .select("mfa_enforcement_enabled,updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PlatformSettings | null;
}

export async function setMfaEnforcement(input: { enabled: boolean; reason: string }) {
  const { error } = await rpc("platform_admin_set_mfa_enforcement", {
    _enabled: input.enabled, _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}
