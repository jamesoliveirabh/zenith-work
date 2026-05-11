import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SlackChannel { id: string; name: string }
export interface SlackConfig {
  bot_token: string;
  team_name?: string;
  team_id?: string;
  channels?: SlackChannel[];
}
export interface WorkspaceIntegration {
  id: string;
  workspace_id: string;
  provider: string;
  config: any;
  is_active: boolean;
}

export function useSlackIntegration(workspaceId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["workspace-integrations", workspaceId, "slack"],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("workspace_integrations")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("provider", "slack")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkspaceIntegration | null;
    },
  });

  const save = useMutation({
    mutationFn: async (botToken: string) => {
      if (!workspaceId) throw new Error("Workspace não selecionado");
      const { data, error } = await supabase.functions.invoke("verify-slack-token", {
        body: { bot_token: botToken },
      });
      if (error) throw error;
      if (!data?.valid) throw new Error(data?.error || "Token inválido");
      const config: SlackConfig = {
        bot_token: botToken,
        team_name: data.team_name,
        team_id: data.team_id,
        channels: data.channels || [],
      };
      const { error: upErr } = await (supabase as any)
        .from("workspace_integrations")
        .upsert(
          { workspace_id: workspaceId, provider: "slack", config, is_active: true },
          { onConflict: "workspace_id,provider" },
        );
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-integrations", workspaceId, "slack"] });
      toast.success("Slack conectado com sucesso");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao conectar Slack"),
  });

  const refreshChannels = useMutation({
    mutationFn: async () => {
      const integ = query.data;
      if (!integ?.config?.bot_token) throw new Error("Conecte o Slack primeiro");
      const { data, error } = await supabase.functions.invoke("verify-slack-token", {
        body: { bot_token: integ.config.bot_token },
      });
      if (error) throw error;
      if (!data?.valid) throw new Error(data?.error || "Falha");
      const config: SlackConfig = { ...integ.config, channels: data.channels || [], team_name: data.team_name, team_id: data.team_id };
      const { error: upErr } = await (supabase as any)
        .from("workspace_integrations")
        .update({ config })
        .eq("id", integ.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-integrations", workspaceId, "slack"] });
      toast.success("Canais atualizados");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const integ = query.data;
      if (!integ) return;
      const { error } = await (supabase as any)
        .from("workspace_integrations")
        .delete()
        .eq("id", integ.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-integrations", workspaceId, "slack"] });
      toast.success("Slack desconectado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    integration: query.data ?? null,
    isLoading: query.isLoading,
    isConnected: !!query.data?.is_active,
    channels: (query.data?.config?.channels as SlackChannel[] | undefined) ?? [],
    save: save.mutateAsync,
    saving: save.isPending,
    remove: remove.mutateAsync,
    removing: remove.isPending,
    refreshChannels: refreshChannels.mutateAsync,
    refreshing: refreshChannels.isPending,
  };
}
