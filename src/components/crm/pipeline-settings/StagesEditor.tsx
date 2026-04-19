import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import type { PipelineStageV2, StageType } from "@/types/pipelines";

interface StagesEditorProps {
  pipelineId: string;
}

const STAGE_TYPES: Array<{ value: StageType; label: string }> = [
  { value: "open", label: "Aberto" },
  { value: "won", label: "Ganho" },
  { value: "lost", label: "Perdido" },
];

export const StagesEditor = ({ pipelineId }: StagesEditorProps) => {
  const { stages, isLoading, createStage, updateStage, deleteStage, reorderStages } =
    usePipelineStagesV2(pipelineId);

  const [newName, setNewName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = stages.findIndex((s) => s.id === active.id);
    const newIdx = stages.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(stages, oldIdx, newIdx);
    reorderStages.mutate(reordered.map((s) => s.id));
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    createStage.mutate({ pipeline_id: pipelineId, name: newName.trim() });
    setNewName("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Etapas</h4>
        <span className="text-xs text-muted-foreground">{stages.length}</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : stages.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Nenhuma etapa. Adicione a primeira abaixo.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {stages.map((s) => (
                <SortableStageRow
                  key={s.id}
                  stage={s}
                  onChange={(patch) => updateStage.mutate({ id: s.id, ...patch })}
                  onDelete={() => deleteStage.mutate(s.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nova etapa…"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!newName.trim() || createStage.isPending}
        >
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>
    </div>
  );
};

interface SortableStageRowProps {
  stage: PipelineStageV2;
  onChange: (patch: Partial<Pick<PipelineStageV2, "name" | "color" | "stage_type">>) => void;
  onDelete: () => void;
}

const SortableStageRow = ({ stage, onChange, onDelete }: SortableStageRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-card border border-border rounded-md"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground p-1"
        aria-label="Reordenar etapa"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <input
        type="color"
        value={stage.color}
        onChange={(e) => onChange({ color: e.target.value })}
        className="h-7 w-9 rounded border border-border bg-transparent cursor-pointer"
        aria-label="Cor da etapa"
      />

      <Input
        value={stage.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="flex-1 h-8"
      />

      <Select
        value={stage.stage_type}
        onValueChange={(v) => onChange({ stage_type: v as StageType })}
      >
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_TYPES.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label="Excluir etapa"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
