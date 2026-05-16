export type ReleaseStatus = "planning" | "ready" | "staging" | "released" | "rolled_back" | "cancelled";
export type ReleaseItemType = "task" | "change_request" | "sprint" | "debt";

export interface Release {
  id: string;
  workspace_id: string;
  team_id: string | null;
  sprint_id: string | null;
  version: string;
  name: string;
  description: string | null;
  status: ReleaseStatus;
  release_notes: string | null;
  target_date: string | null;
  released_at: string | null;
  deployed_by: string | null;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  rollback_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseItem {
  id: string;
  release_id: string;
  item_type: ReleaseItemType;
  item_id: string;
  notes: string | null;
  added_by: string | null;
  added_at: string;
}
