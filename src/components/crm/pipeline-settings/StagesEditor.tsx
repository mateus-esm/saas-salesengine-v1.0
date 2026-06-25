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
import { GripVertical, Plus, Trash2, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import type {
  PipelineStageV2,
  StageType,
  StageWebhookEvent,
  StageWebhookTrigger,
} from "@/types/pipelines";

interface StagesEditorProps {
  pipelineId: string;
}

// Internal value stays English; the label is PT-BR (standard i18n: stable codes,
// translated display). Matches the DB CHECK ('open','won','lost','ciclo').
const STAGE_TYPES: Array<{ value: StageType; label: string }> = [
  { value: "open", label: "Aberto" },
  { value: "won", label: "Ganho" },
  { value: "lost", label: "Perdido" },
  { value: "ciclo", label: "Ciclo" },
];

// Sprint 5.3 T8 — cadence/lifecycle events a stage can fire webhooks on.
const STAGE_WEBHOOK_EVENTS: Array<{ value: StageWebhookEvent; label: string }> = [
  { value: "on_stage_entered", label: "Ao entrar na etapa" },
  { value: "on_idle_breach", label: "Ao estourar o SLA (ocioso)" },
  { value: "on_cadence_deadline", label: "Ao vencer a cadência" },
];

const NONE = "__none__";

const parsePositiveIntOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

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
                  pipelineStages={stages}
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
  pipelineStages: PipelineStageV2[];
  onChange: (
    patch: Partial<
      Pick<
        PipelineStageV2,
        | "name"
        | "color"
        | "stage_type"
        | "max_idle_hours"
        | "max_interactions"
        | "cadence_value"
        | "cadence_unit"
        | "webhook_triggers"
        | "description"
        | "cycle_days"
        | "cycle_target_stage_id"
        | "cycle_webhook_url"
      >
    >,
  ) => void;
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
      className="bg-card border border-border rounded-md p-3 space-y-3"
    >
      {/* Row 1: drag handle + color + name + type + delete */}
      <div className="flex items-center gap-2">
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

      {/* Row 2: SLA + Max interactions + Cadence */}
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">SLA (horas)</Label>
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={stage.max_idle_hours ?? ""}
            onChange={(e) =>
              onChange({ max_idle_hours: parsePositiveIntOrNull(e.target.value) })
            }
            className="h-8"
            aria-label="SLA em horas da etapa"
          />
        </div>

        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Máx. interações</Label>
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={stage.max_interactions ?? ""}
            onChange={(e) =>
              onChange({ max_interactions: parsePositiveIntOrNull(e.target.value) })
            }
            className="h-8"
            aria-label="Máximo de interações da etapa"
          />
        </div>

        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Cadência</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={stage.cadence_value ?? ""}
              onChange={(e) =>
                onChange({ cadence_value: parsePositiveIntOrNull(e.target.value) })
              }
              className="h-8 flex-1"
              aria-label="Valor da cadência"
              placeholder="—"
            />
            <Select
              value={stage.cadence_unit ?? NONE}
              onValueChange={(v) =>
                onChange({ cadence_unit: v === NONE ? null : (v as 'hours' | 'days') })
              }
            >
              <SelectTrigger className="h-8 w-16 px-1">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                <SelectItem value="hours">h</SelectItem>
                <SelectItem value="days">d</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Row 3: Webhook */}
      <div>
        <StageWebhookPopover
          triggers={stage.webhook_triggers ?? []}
          onChange={(webhook_triggers) => onChange({ webhook_triggers })}
        />
      </div>

      {/* Row 4: Ciclo config (conditional) */}
      {stage.stage_type === "ciclo" && (
        <div className="flex items-start gap-3 pt-2 border-t border-border">
          <div className="grid w-[120px] gap-1">
            <span className="text-[10px] leading-none text-muted-foreground">Dias de ciclo</span>
            <span className="text-[9px] leading-none text-muted-foreground/60">
              Após X dias, o lead retorna à etapa de destino
            </span>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={stage.cycle_days ?? ""}
              onChange={(e) =>
                onChange({ cycle_days: parsePositiveIntOrNull(e.target.value) })
              }
              className="h-8"
              aria-label="Dias de ciclo"
            />
          </div>

          <div className="grid flex-1 gap-1">
            <span className="text-[10px] leading-none text-muted-foreground">Etapa de destino</span>
            <Select
              value={stage.cycle_target_stage_id ?? NONE}
              onValueChange={(v) =>
                onChange({ cycle_target_stage_id: v === NONE ? null : v })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Selecionar etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhuma</SelectItem>
                {pipelineStages
                  .filter((s) => s.id !== stage.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid flex-1 gap-1">
            <span className="text-[10px] leading-none text-muted-foreground">Webhook</span>
            <Input
              type="text"
              value={stage.cycle_webhook_url ?? ""}
              onChange={(e) =>
                onChange({ cycle_webhook_url: e.target.value || null })
              }
              className="h-8"
              placeholder="https://..."
              aria-label="Webhook do ciclo"
            />
          </div>
        </div>
      )}

      {/* Row 5: Description */}
      <div>
        <Label className="text-xs text-muted-foreground">
          Descrição (treina o copiloto)
        </Label>
        <Textarea
          value={stage.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          rows={2}
          className="mt-1 text-xs resize-none"
          placeholder="Ex.: Leads que já receberam proposta e estão avaliando a compra."
        />
      </div>
    </div>
  );
};

interface StageWebhookPopoverProps {
  triggers: StageWebhookTrigger[];
  onChange: (triggers: StageWebhookTrigger[]) => void;
}

/**
 * Sprint 5.3 T8 — maps each cadence/lifecycle event to an optional webhook.
 * Stored as a compact { event, webhook_id }[] on the stage; an unset event is
 * simply absent from the array.
 */
const StageWebhookPopover = ({ triggers, onChange }: StageWebhookPopoverProps) => {
  const { configs } = useWebhookConfigs();
  const activeCount = triggers.length;

  const webhookForEvent = (event: StageWebhookEvent) =>
    triggers.find((t) => t.event === event)?.webhook_id ?? NONE;

  const setEvent = (event: StageWebhookEvent, webhookId: string) => {
    const rest = triggers.filter((t) => t.event !== event);
    onChange(
      webhookId === NONE ? rest : [...rest, { event, webhook_id: webhookId }],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label="Configurar webhooks da etapa"
        >
          <Webhook className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="text-xs font-medium">Webhooks da etapa</p>
        {configs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum webhook cadastrado. Crie um em Webhooks para vinculá-lo aqui.
          </p>
        ) : (
          STAGE_WEBHOOK_EVENTS.map((evt) => (
            <div key={evt.value} className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">{evt.label}</span>
              <Select
                value={webhookForEvent(evt.value)}
                onValueChange={(v) => setEvent(evt.value, v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {configs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
};
