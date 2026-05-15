import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SlackChannelRow {
  id: string;
  workspace_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: "public" | "private";
  is_archived: boolean;
}

export function useSlackChannels(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ["slack-channels", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("slack_channels")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("is_archived", false)
        .order("channel_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SlackChannelRow[];
    },
  });

  const integrationQuery = useQuery({
    queryKey: ["slack-integration-default", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("workspace_integrations")
        .select("id, slack_default_channel_id")
        .eq("workspace_id", workspaceId!)
        .eq("provider", "slack")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; slack_default_channel_id: string | null } | null;
    },
  });

  useEffect(() => {
    if (integrationQuery.data?.slack_default_channel_id) {
      setSelectedChannel(integrationQuery.data.slack_default_channel_id);
    }
  }, [integrationQuery.data?.slack_default_channel_id]);

  const sync = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace não selecionado");
      const { data, error } = await supabase.functions.invoke("sync-slack-channels", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao sincronizar");
      return data.channels_count as number;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["slack-channels", workspaceId] });
      qc.invalidateQueries({ queryKey: ["workspace-integrations", workspaceId, "slack"] });
      toast.success(`${count} canais sincronizados`);
    },
    onError: (e: any) => toast.error(e.message || "Falha ao sincronizar canais"),
  });

  const selectChannel = useMutation({
    mutationFn: async (channelId: string) => {
      const id = integrationQuery.data?.id;
      if (!id) throw new Error("Integração Slack não encontrada");
      const { error } = await (supabase as any)
        .from("workspace_integrations")
        .update({ slack_default_channel_id: channelId })
        .eq("id", id);
      if (error) throw error;
      return channelId;
    },
    onSuccess: (channelId) => {
      setSelectedChannel(channelId);
      qc.invalidateQueries({ queryKey: ["slack-integration-default", workspaceId] });
      toast.success("Canal padrão salvo");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao salvar canal"),
  });

  return {
    channels: channelsQuery.data ?? [],
    loading: channelsQuery.isLoading || integrationQuery.isLoading,
    error: channelsQuery.error,
    syncChannels: sync.mutateAsync,
    syncing: sync.isPending,
    selectedChannel,
    selectChannel: selectChannel.mutateAsync,
    selecting: selectChannel.isPending,
  };
}

export async function getSlackChannels(workspaceId: string): Promise<SlackChannelRow[]> {
  const { data, error } = await (supabase as any)
    .from("slack_channels")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_archived", false)
    .order("channel_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SlackChannelRow[];
}

export async function syncSlackChannels(workspaceId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke("sync-slack-channels", {
    body: { workspace_id: workspaceId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Falha ao sincronizar");
  return data.channels_count as number;
}
