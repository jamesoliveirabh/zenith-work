export interface AuditLog {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface TaskAuditEntry {
  id: string;
  task_id: string;
  workspace_id: string;
  actor_id: string | null;
  action: string;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogFilters {
  entityType?: string;
  action?: string;
  actorId?: string;
  dateRange?: { from: string; to: string };
  limit?: number;
  offset?: number;
}
