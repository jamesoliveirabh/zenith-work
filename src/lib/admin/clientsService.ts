import { supabase } from "@/integrations/supabase/client";

/**
 * Phase P1 — client management service for the platform owner backoffice.
 * All RPCs validate `is_platform_admin(auth.uid())` server-side and audit to
 * `platform_admin_actions_log`. Client-side guards are UX only.
 */

export interface ClientRow {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
  workspace_created_at: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  plan_code: string | null;
  plan_name: string | null;
  sub_status: string | null;
  current_period_end: string | null;
  open_dunning_case_id: string | null;
  updated_at: string | null;
  total_count: number;
}

export interface ClientDetail {
  workspace: Record<string, unknown> | null;
  owner: Record<string, unknown> | null;
  member_count: number;
  subscription: { subscription: Record<string, unknown>; plan: Record<string, unknown> | null } | null;
  usage_snapshot: Record<string, number>;
  recent_events: Array<Record<string, unknown>>;
  admin_actions: Array<Record<string, unknown>>;
  platform_actions: Array<Record<string, unknown>>;
  notes: Array<{ id: string; body: string; author_id: string | null; author_email: string | null; created_at: string }>;
}

export interface ListClientsInput {
  search?: string;
  planCode?: string;
  subStatus?: string;
  suspendedOnly?: boolean;
  createdAfter?: string | null;
  createdBefore?: string | null;
  limit?: number;
  offset?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

export async function listClients(input: ListClientsInput): Promise<ClientRow[]> {
  const { data, error } = await rpc("platform_admin_list_clients", {
    _search: input.search?.trim() || null,
    _plan_code: input.planCode || null,
    _sub_status: input.subStatus || null,
    _suspended_only: input.suspendedOnly ?? false,
    _created_after: input.createdAfter ?? null,
    _created_before: input.createdBefore ?? null,
    _limit: input.limit ?? 50,
    _offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientRow[];
}

export async function getClientDetail(workspaceId: string): Promise<ClientDetail> {
  const { data, error } = await rpc("platform_admin_client_detail", {
    _workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  return data as ClientDetail;
}

export async function suspendWorkspace(workspaceId: string, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new Error("Motivo deve ter pelo menos 3 caracteres");
  const { error } = await rpc("platform_admin_suspend_workspace", {
    _workspace_id: workspaceId,
    _reason: trimmed,
  });
  if (error) throw new Error(error.message);
}

export async function reactivateWorkspace(workspaceId: string, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new Error("Motivo deve ter pelo menos 3 caracteres");
  const { error } = await rpc("platform_admin_reactivate_workspace", {
    _workspace_id: workspaceId,
    _reason: trimmed,
  });
  if (error) throw new Error(error.message);
}

export async function addInternalNote(workspaceId: string, body: string): Promise<string> {
  const trimmed = body.trim();
  if (trimmed.length < 1) throw new Error("Observação não pode ser vazia");
  if (trimmed.length > 2000) throw new Error("Observação muito longa (máx 2000)");
  const { data, error } = await rpc("platform_admin_add_note", {
    _workspace_id: workspaceId,
    _body: trimmed,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
