import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SpaceSlackSettings {
  id: string;
  workspace_id: string;
  space_id: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  is_configured: boolean;
}

export function useSpaceSlackSettings(spaceId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["space-slack-settings", workspaceId, spaceId],
    enabled: !!spaceId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("space_slack_settings")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("space_id", spaceId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SpaceSlackSettings | null;
    },
  });

  const updateChannel = useMutation({
    mutationFn: async (params: { channelId: string | null; channelName: string | null }) => {
      if (!spaceId || !workspaceId) throw new Error("Espaço/workspace não selecionado");
      const payload = {
        workspace_id: workspaceId,
        space_id: spaceId,
        slack_channel_id: params.channelId,
        slack_channel_name: params.channelName,
        is_configured: !!params.channelId,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("space_slack_settings")
        .upsert(payload, { onConflict: "workspace_id,space_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-slack-settings", workspaceId, spaceId] });
      toast.success("Canal do espaço atualizado");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao salvar canal"),
  });

  return {
    settings: settingsQuery.data ?? null,
    loading: settingsQuery.isLoading,
    error: settingsQuery.error,
    updateChannel: updateChannel.mutateAsync,
    saving: updateChannel.isPending,
  };
}

export async function getSpaceSlackChannel(spaceId: string, workspaceId: string) {
  const { data, error } = await (supabase as any)
    .from("space_slack_settings")
    .select("slack_channel_id, slack_channel_name, is_configured")
    .eq("workspace_id", workspaceId)
    .eq("space_id", spaceId)
    .maybeSingle();
  if (error) throw error;
  return {
    channelId: (data?.slack_channel_id ?? null) as string | null,
    channelName: (data?.slack_channel_name ?? null) as string | null,
    isConfigured: !!data?.is_configured,
  };
}
