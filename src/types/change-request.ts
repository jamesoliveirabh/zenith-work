export type ChangeType = "feature" | "bugfix" | "hotfix" | "config" | "infrastructure" | "security" | "docs";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ChangeRequestStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "implemented"
  | "rolled_back"
  | "cancelled";

export interface ChangeRequest {
  id: string;
  workspace_id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  change_type: ChangeType;
  risk_level: RiskLevel;
  impacted_areas: string[] | null;
  rollback_plan: string | null;
  testing_plan: string | null;
  status: ChangeRequestStatus;
  requested_by: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  target_release_id: string | null;
  approval_request_id: string | null;
  approved_at: string | null;
  implemented_at: string | null;
  implemented_by: string | null;
  created_at: string;
  updated_at: string;
}
