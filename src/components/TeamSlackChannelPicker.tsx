import { useSlackChannels } from "@/hooks/useSlackChannels";
import { useTeamSlackSettings } from "@/hooks/useTeamSlackSettings";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Hash, Lock, Slack, Loader2 } from "lucide-react";

interface Props {
  workspaceId: string;
  teamId: string;
}

const GLOBAL_VALUE = "__global__";

export function TeamSlackChannelPicker({ workspaceId, teamId }: Props) {
  const { channels, loading: loadingChannels } = useSlackChannels(workspaceId);
  const { settings, loading: loadingSettings, updateChannel, saving } =
    useTeamSlackSettings(teamId, workspaceId);

  const value =
    settings?.is_configured && settings.slack_channel_id
      ? settings.slack_channel_id
      : GLOBAL_VALUE;

  const onChange = async (next: string) => {
    if (next === GLOBAL_VALUE) {
      await updateChannel({ channelId: null, channelName: null });
    } else {
      const ch = channels.find((c) => c.channel_id === next);
      await updateChannel({
        channelId: next,
        channelName: ch?.channel_name ?? null,
      });
    }
  };

  const disabled = loadingChannels || loadingSettings || saving;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Slack className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0">Canal Slack:</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-7 text-xs w-[220px]">
          <SelectValue placeholder="Selecionar canal..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GLOBAL_VALUE}>Usar canal global</SelectItem>
          {channels.map((c) => (
            <SelectItem key={c.channel_id} value={c.channel_id}>
              <span className="inline-flex items-center gap-1.5">
                {c.channel_type === "private" ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Hash className="h-3 w-3" />
                )}
                {c.channel_name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    </div>
  );
}
