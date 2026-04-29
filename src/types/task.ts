// Shared task domain types used across views and hooks.
// Field names mirror the Supabase columns (snake_case) so we can spread query results.

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Status {
  id: string;
  name: string;
  color: string | null;
  is_done: boolean;
  position: number;
}

export interface Assignee {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: unknown | null; // Tiptap JSONB
  description_text: string | null;
  status_id: string | null;
  priority: Priority;
  assignees: Assignee[];
  due_date: string | null;
  start_date: string | null;
  position: number;
  created_at: string;
  tags: string[] | null;
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "description"
    | "status_id"
    | "priority"
    | "due_date"
    | "start_date"
    | "position"
    | "tags"
  >
>;
