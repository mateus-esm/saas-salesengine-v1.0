import { useState } from "react";
import { PipelineStage } from "@/types/crm";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, GripVertical, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

interface StageItemProps {
  stage: PipelineStage;
  onUpdate: (id: string, data: Partial<PipelineStage>) => void;
  onDelete: (id: string) => void;
}

function SortableStage({ stage, onUpdate, onDelete }: StageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-card border rounded-lg mb-2 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab hover:text-primary">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input
          value={stage.name}
          onChange={(e) => onUpdate(stage.id, { name: e.target.value })}
          placeholder="Nome da etapa"
          className="h-9"
        />
        <div className="flex items-center gap-2">
           <Input
            type="color"
            value={stage.color}
            onChange={(e) => onUpdate(stage.id, { color: e.target.value })}
            className="w-12 h-9 p-1 px-2 cursor-pointer"
          />
          <span className="text-xs text-muted-foreground uppercase">{stage.color}</span>
        </div>
      </div>

      {!stage.is_default && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(stage.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function PipelineSettings() {
  const { stages, isLoading, createStage, updateStage, deleteStage, reorderStages } = usePipelineStages();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex((s) => s.id === active.id);
      const newIndex = stages.findIndex((s) => s.id === over.id);

      const newOrder = arrayMove(stages, oldIndex, newIndex);
      
      // Call reorder mutation with ids
      reorderStages.mutate(newOrder.map(s => s.id));
    }
  };

  const handleAddStage = () => {
    createStage.mutate({
      name: "Nova Etapa",
      color: "#aaaaaa",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">
            Personalize as etapas do seu funil de vendas. Arraste para reordenar.
          </p>
        </div>
        <Button onClick={handleAddStage} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Etapa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Etapas do Funil</CardTitle>
          <CardDescription>
            Defina o fluxo que seus leads percorrerão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={stages.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {stages.map((stage) => (
                  <SortableStage
                    key={stage.id}
                    stage={stage}
                    onUpdate={(id, data) => updateStage.mutate({ id, ...data })}
                    onDelete={(id) => deleteStage.mutate(id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}
