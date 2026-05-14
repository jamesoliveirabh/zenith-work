import { supabase } from "@/integrations/supabase/client";

export async function validateUserRole(userId: string, requiredRole: string[]): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("users")
    .select("global_role")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return requiredRole.includes(data.global_role);
}

export async function validateWorkspaceAccess(
  userId: string,
  workspaceId: string,
  requiredRole?: string[]
): Promise<boolean> {
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return false;
  if (requiredRole && !requiredRole.includes(member.role as string)) return false;
  return true;
}
