import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Settings2, GripVertical, Eye, EyeOff, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { useStatuses } from "@/hooks/useStatuses";
import {
  useDashboardConfig, type ResolvedWidget, type WidgetType,
} from "@/hooks/useDashboard";
import {
  ActivityFeedWidget, MyTasksWidget, OverdueTasksWidget,
  PriorityOverviewWidget, SpaceProgressWidget, WeeklyActivityWidget,
  GoalsOverviewWidget,
} from "@/components/dashboard/DashboardWidgets";
import { cn } from "@/lib/utils";

const WIDGET_LABELS: Record<WidgetType, string> = {
  "my-tasks": "Minhas tarefas",
  "activity-feed": "Atividade recente",
  "overdue-tasks": "Tarefas atrasadas",
  "space-progress": "Progresso dos Spaces",
  "priority-overview": "Tarefas por prioridade",
  "weekly-activity": "Atividade da semana",
};

export default function Dashboard() {
  const { user } = useAuth();
  const { current, loading: wsLoading } = useWorkspace();
  const { data: widgets, isLoading, save } = useDashboardConfig(user?.id, current?.id);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ResolvedWidget[] | null>(null);

  const [openTask, setOpenTask] = useState<{ id: string; listId: string } | null>(null);
  const { data: openStatuses = [] } = useStatuses(openTask?.listId);
  const doneStatusId = useMemo(
    () => openStatuses.find((s) => s.is_done)?.id ?? null,
    [openStatuses],
  );

  if (wsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!current) return <Navigate to="/auth" replace />;

  const list = draft ?? widgets ?? [];

  const startEdit = () => {
    setDraft(widgets ? [...widgets] : []);
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };
  const finishEdit = async () => {
    if (!draft) return;
    await save.mutateAsync(draft);
    setDraft(null);
    setEditing(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{current.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={cancelEdit}>Cancelar</Button>
              <Button size="sm" onClick={finishEdit} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Concluir
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Personalizar
            </Button>
          )}
        </div>
      </header>

      {isLoading || !user ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : editing && draft ? (
        <DashboardEditor
          widgets={draft}
          onChange={setDraft}
        />
      ) : (
        <DashboardGrid
          widgets={list.filter((w) => w.is_visible)}
          userId={user.id}
          workspaceId={current.id}
          onOpenTask={(id, listId) => setOpenTask({ id, listId })}
        />
      )}

      <TaskDetailDialog
        taskId={openTask?.id ?? null}
        listId={openTask?.listId ?? ""}
        doneStatusId={doneStatusId}
        open={!!openTask}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </div>
  );
}

// ===== Grid (read-only) =====

function DashboardGrid({
  widgets, userId, workspaceId, onOpenTask,
}: {
  widgets: ResolvedWidget[];
  userId: string;
  workspaceId: string;
  onOpenTask: (id: string, listId: string) => void;
}) {
  if (widgets.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Nenhum widget visível. Use "Personalizar" para ativá-los.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {widgets.map((w) => (
        <RenderWidget
          key={w.widget_type}
          type={w.widget_type}
          userId={userId}
          workspaceId={workspaceId}
          onOpenTask={onOpenTask}
        />
      ))}
    </div>
  );
}

function RenderWidget({
  type, userId, workspaceId, onOpenTask,
}: {
  type: WidgetType;
  userId: string;
  workspaceId: string;
  onOpenTask: (id: string, listId: string) => void;
}) {
  switch (type) {
    case "my-tasks":
      return <MyTasksWidget userId={userId} workspaceId={workspaceId} onOpenTask={onOpenTask} />;
    case "activity-feed":
      return <ActivityFeedWidget workspaceId={workspaceId} onOpenTask={onOpenTask} />;
    case "overdue-tasks":
      return <OverdueTasksWidget workspaceId={workspaceId} onOpenTask={onOpenTask} />;
    case "space-progress":
      return <SpaceProgressWidget workspaceId={workspaceId} onOpenTask={onOpenTask} />;
    case "priority-overview":
      return <PriorityOverviewWidget workspaceId={workspaceId} onOpenTask={onOpenTask} />;
    case "weekly-activity":
      return <WeeklyActivityWidget workspaceId={workspaceId} onOpenTask={onOpenTask} />;
  }
}

// ===== Editor =====

function DashboardEditor({
  widgets, onChange,
}: {
  widgets: ResolvedWidget[];
  onChange: (next: ResolvedWidget[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex((w) => w.widget_type === active.id);
    const newIdx = widgets.findIndex((w) => w.widget_type === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(widgets, oldIdx, newIdx).map((w, i) => ({ ...w, position: i }));
    onChange(next);
  };

  const toggle = (type: WidgetType, visible: boolean) => {
    onChange(widgets.map((w) => (w.widget_type === type ? { ...w, is_visible: visible } : w)));
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-3">
        Arraste para reordenar. Use o interruptor para mostrar ou ocultar cada widget.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={widgets.map((w) => w.widget_type)}
          strategy={rectSortingStrategy}
        >
          <ul className="space-y-2">
            {widgets.map((w) => (
              <SortableEditorRow key={w.widget_type} widget={w} onToggle={toggle} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableEditorRow({
  widget, onToggle,
}: {
  widget: ResolvedWidget;
  onToggle: (type: WidgetType, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.widget_type });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-2",
        isDragging && "ring-2 ring-primary",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm flex-1">{WIDGET_LABELS[widget.widget_type]}</span>
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        {widget.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {widget.is_visible ? "Visível" : "Oculto"}
      </span>
      <Switch
        checked={widget.is_visible}
        onCheckedChange={(v) => onToggle(widget.widget_type, v)}
      />
    </li>
  );
}
