import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  parseDurationInput,
  useActiveTimer,
  useAddManualEntry,
  useDeleteTimeEntry,
  useStartTimer,
  useStopTimer,
  useTimeEntries,
  type TimeEntry,
} from "@/hooks/useTimeTracking";
import { toast } from "sonner";

interface Props {
  taskId: string;
  estimateSeconds: number | null;
  onEstimateChange: (seconds: number | null) => void;
  isAdmin?: boolean;
}

export function TimeTracker({ taskId, estimateSeconds, onEstimateChange, isAdmin }: Props) {
  const { user } = useAuth();
  const { current } = useWorkspace();

  const { data: entries = [] } = useTimeEntries(taskId);
  const { data: activeTimer } = useActiveTimer(user?.id);
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const addManual = useAddManualEntry();
  const deleteEntry = useDeleteTimeEntry();

  // Live ticking second for cronometer + running entries
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!activeTimer) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [activeTimer?.id]);

  const myActiveOnThisTask =
    activeTimer && activeTimer.task_id === taskId ? activeTimer : null;

  const totalSeconds = useMemo(() => {
    const now = Date.now();
    return entries.reduce((acc, e) => {
      const dur =
        e.duration_seconds ??
        (e.ended_at
          ? Math.floor((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000)
          : Math.floor((now - new Date(e.started_at).getTime()) / 1000));
      return acc + Math.max(0, dur);
    }, 0);
    // tick included to recompute every second when running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, tick]);

  const liveActiveSeconds = myActiveOnThisTask
    ? Math.max(0, Math.floor((Date.now() - new Date(myActiveOnThisTask.started_at).getTime()) / 1000))
    : 0;

  const handleStart = () => {
    if (!user || !current) return;
    startTimer.mutate({ taskId, workspaceId: current.id, userId: user.id });
  };
  const handleStop = () => {
    if (!myActiveOnThisTask || !user) return;
    stopTimer.mutate({
      entryId: myActiveOnThisTask.id,
      startedAt: myActiveOnThisTask.started_at,
      taskId,
      userId: user.id,
    });
  };

  // Manual entry form
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDuration, setManualDuration] = useState("");
  const [manualDate, setManualDate] = useState<Date>(new Date());
  const [manualNote, setManualNote] = useState("");

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !current) return;
    const seconds = parseDurationInput(manualDuration);
    if (!seconds || seconds <= 0) {
      toast.error("Duração inválida. Use formatos como '1h 30m', '45m' ou '2h'.");
      return;
    }
    addManual.mutate(
      {
        taskId,
        workspaceId: current.id,
        userId: user.id,
        durationSeconds: seconds,
        date: manualDate,
        note: manualNote.trim() || null,
      },
      {
        onSuccess: () => {
          setManualDuration("");
          setManualNote("");
          setManualDate(new Date());
          setManualOpen(false);
        },
      },
    );
  };

  // Estimate inline edit
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateInput, setEstimateInput] = useState("");
  const startEditEstimate = () => {
    setEstimateInput(estimateSeconds ? formatDuration(estimateSeconds) : "");
    setEditingEstimate(true);
  };
  const commitEstimate = () => {
    const trimmed = estimateInput.trim();
    if (!trimmed) {
      onEstimateChange(null);
    } else {
      const sec = parseDurationInput(trimmed);
      if (sec === null) {
        toast.error("Estimativa inválida. Use formatos como '4h' ou '2h 30m'.");
        setEditingEstimate(false);
        return;
      }
      onEstimateChange(sec);
    }
    setEditingEstimate(false);
  };

  const overEstimate = estimateSeconds != null && totalSeconds > estimateSeconds;

  // Group entries by date (yyyy-mm-dd)
  const grouped = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    entries.forEach((e) => {
      const k = format(new Date(e.started_at), "yyyy-MM-dd");
      (m[k] ||= []).push(e);
    });
    return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {myActiveOnThisTask ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleStop}
              disabled={stopTimer.isPending}
            >
              <Pause className="h-3.5 w-3.5" />
              Parar
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleStart}
              disabled={startTimer.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              Iniciar
            </Button>
          )}
          {myActiveOnThisTask && (
            <span className="text-sm font-mono tabular-nums text-priority-low">
              {formatDuration(liveActiveSeconds, { withSeconds: true })}
            </span>
          )}
          {!myActiveOnThisTask && activeTimer && (
            <span className="text-[11px] text-muted-foreground">
              Você tem um timer ativo em outra tarefa
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className={cn("font-medium tabular-nums", overEstimate && "text-destructive")}>
            {formatDuration(totalSeconds)}
          </span>
          <span className="text-muted-foreground">/</span>
          {editingEstimate ? (
            <Input
              autoFocus
              value={estimateInput}
              onChange={(e) => setEstimateInput(e.target.value)}
              onBlur={commitEstimate}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEstimate();
                }
                if (e.key === "Escape") setEditingEstimate(false);
              }}
              placeholder="2h 30m"
              className="h-7 w-24 text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={startEditEstimate}
              className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
            >
              {estimateSeconds ? `${formatDuration(estimateSeconds)} estimado` : "+ estimativa"}
            </button>
          )}
        </div>
      </div>

      <div>
        {!manualOpen ? (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Adicionar tempo manualmente
          </button>
        ) : (
          <form
            onSubmit={submitManual}
            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2"
          >
            <Input
              value={manualDuration}
              onChange={(e) => setManualDuration(e.target.value)}
              placeholder="1h 30m"
              className="h-8 w-24 text-xs"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(manualDate, "dd MMM", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={manualDate}
                  onSelect={(d) => d && setManualDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Input
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="h-8 flex-1 min-w-[140px] text-xs"
            />
            <Button type="submit" size="sm" className="h-8" disabled={addManual.isPending}>
              Adicionar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setManualOpen(false)}
            >
              Cancelar
            </Button>
          </form>
        )}
      </div>

      {entries.length > 0 && (
        <div className="rounded-md border">
          <div className="divide-y">
            {grouped.map(([day, list]) => (
              <div key={day} className="px-3 py-2">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {format(new Date(day), "EEEE, dd MMM yyyy", { locale: ptBR })}
                </div>
                <div className="space-y-1">
                  {list.map((e) => {
                    const running = !e.ended_at;
                    const dur = running
                      ? Math.floor((Date.now() - new Date(e.started_at).getTime()) / 1000)
                      : e.duration_seconds ??
                        Math.floor(
                          (new Date(e.ended_at!).getTime() - new Date(e.started_at).getTime()) / 1000,
                        );
                    const name =
                      e.user?.display_name || e.user?.email?.split("@")[0] || "Usuário";
                    const initial = name.charAt(0).toUpperCase();
                    const canDelete = e.user_id === user?.id || isAdmin;
                    return (
                      <div key={e.id} className="flex items-center gap-2 text-sm group">
                        <Avatar className="h-5 w-5">
                          {e.user?.avatar_url && <AvatarImage src={e.user.avatar_url} />}
                          <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{name}</span>
                        <span
                          className={cn(
                            "text-xs font-mono tabular-nums",
                            running ? "text-priority-low" : "text-muted-foreground",
                          )}
                        >
                          {formatDuration(dur)}
                          {running && " (em curso)"}
                        </span>
                        {e.note && (
                          <span className="text-xs text-muted-foreground truncate flex-1">
                            — {e.note}
                          </span>
                        )}
                        {!e.note && <div className="flex-1" />}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() =>
                              deleteEntry.mutate({
                                entryId: e.id,
                                taskId,
                                userId: e.user_id,
                              })
                            }
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t bg-muted/30 text-xs flex justify-between items-center">
            <span className="text-muted-foreground">Total</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                overEstimate && "text-destructive",
              )}
            >
              {formatDuration(totalSeconds)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
