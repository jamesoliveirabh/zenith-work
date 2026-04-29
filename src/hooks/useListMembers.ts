import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Assignee } from "@/types/task";

export const membersKey = (workspaceId: string) => ["workspace-members", workspaceId] as const;

export function useListMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: membersKey(workspaceId ?? ""),
    enabled: !!workspaceId,
    queryFn: async (): Promise<Assignee[]> => {
      const { data: m, error: e1 } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId!);
      if (e1) throw e1;
      const ids = (m ?? []).map((x) => x.user_id);
      if (ids.length === 0) return [];
      const { data: profiles, error: e2 } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,email")
        .in("id", ids);
      if (e2) throw e2;
      return (profiles ?? []) as Assignee[];
    },
  });
}
