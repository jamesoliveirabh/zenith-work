export type ApprovalEntityType =
  | "task"
  | "sprint"
  | "technical_debt"
  | "tech_spike"
  | "pull_request"
  | "time_entry"
  | "goal"
  | "custom";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type ApproverType = "user" | "workspace_role" | "team_role";
export type ApprovalDecisionType = "approved" | "rejected";

export interface ApprovalWorkflow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  entity_type: ApprovalEntityType;
  trigger_condition: Record<string, unknown> | null;
  is_active: boolean;
  auto_approve_requester: boolean;
  expires_after_hours: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalWorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  approver_type: ApproverType;
  approver_user_id: string | null;
  approver_role: string | null;
  approver_team_id: string | null;
  required_approvals: number;
  allow_self_approval: boolean;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  workflow_id: string;
  entity_type: ApprovalEntityType;
  entity_id: string;
  requested_by: string;
  current_step_order: number;
  status: ApprovalStatus;
  reason: string | null;
  context: Record<string, unknown> | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDecision {
  id: string;
  request_id: string;
  step_id: string;
  step_order: number;
  approver_id: string;
  decision: ApprovalDecisionType;
  comment: string | null;
  decided_at: string;
}
