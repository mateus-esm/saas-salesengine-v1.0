import { useEffect, useMemo, useState } from "react";
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
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import type { CustomFieldSchema, CustomFieldType } from "@/types/pipelines";

export const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texto",
  number: "Número",
  currency: "Moeda",
  date: "Data",
  boolean: "Sim/Não",
  select: "Seleção",
  multi_select: "Seleção múltipla",
  url: "URL",
  phone: "Telefone",
  address: "Endereço",
  company_ref: "Empresa",
  property_ref: "Propriedade",
  contact_ref: "Contato",
};

const TYPES_WITH_OPTIONS: CustomFieldType[] = ["select", "multi_select"];
const TYPES_AS_REF: CustomFieldType[] = [
  "company_ref",
  "property_ref",
  "contact_ref",
];

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

export const newFieldId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface CustomFieldsEditorProps {
  schema: CustomFieldSchema[];
  cardFieldIds: string[];
  onChange: (next: { schema: CustomFieldSchema[]; cardFieldIds: string[] }) => void;
}

export const CustomFieldsEditor = ({
  schema,
  cardFieldIds,
  onChange,
}: CustomFieldsEditorProps) => {
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftType, setDraftType] = useState<CustomFieldType>("text");

  const visible = useMemo(
    () => [...schema].filter((f) => !f.is_deleted).sort((a, b) => a.position - b.position),
    [schema],
  );
  const deleted = useMemo(() => schema.filter((f) => f.is_deleted), [schema]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const emit = (nextSchema: CustomFieldSchema[], nextCardIds = cardFieldIds) => {
    onChange({ schema: nextSchema, cardFieldIds: nextCardIds });
  };

  const handleAdd = () => {
    if (!draftLabel.trim()) return;
    const field: CustomFieldSchema = {
      field_id: newFieldId(),
      key: slugify(draftLabel) || `field_${visible.length + 1}`,
      label: draftLabel.trim(),
      type: draftType,
      required: false,
      position: visible.length,
      options: TYPES_WITH_OPTIONS.includes(draftType) ? ["Opção 1"] : undefined,
      target_scope: TYPES_AS_REF.includes(draftType) ? "tenant" : undefined,
    };
    emit([...schema, field]);
    setDraftLabel("");
    setDraftType("text");
    setAdding(false);
  };

  const handlePatch = (field_id: string, patch: Partial<CustomFieldSchema>) => {
    emit(
      schema.map((f) => (f.field_id === field_id ? { ...f, ...patch } : f)),
    );
  };

  const handleSoftDelete = (field_id: string) => {
    emit(
      schema.map((f) =>
        f.field_id === field_id ? { ...f, is_deleted: true } : f,
      ),
      cardFieldIds.filter((id) => id !== field_id),
    );
  };

  const handleRestore = (field_id: string) => {
    emit(
      schema.map((f) =>
        f.field_id === field_id ? { ...f, is_deleted: false } : f,
      ),
    );
  };

  const handleToggleCard = (field_id: string) => {
    const next = cardFieldIds.includes(field_id)
      ? cardFieldIds.filter((id) => id !== field_id)
      : [...cardFieldIds, field_id];
    emit(schema, next);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = visible.findIndex((f) => f.field_id === active.id);
    const newIdx = visible.findIndex((f) => f.field_id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(visible, oldIdx, newIdx).map((f, i) => ({
      ...f,
      position: i,
    }));
    // Merge back with deleted entries
    const map = new Map(reordered.map((f) => [f.field_id, f]));
    const merged = schema.map((f) => map.get(f.field_id) ?? f);
    emit(merged);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Campos Personalizados</h4>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo campo
        </Button>
      </div>

      {visible.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground italic">
          Nenhum campo personalizado. Clique em “Novo campo” para começar.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((f) => f.field_id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {visible.map((f) => (
              <SortableFieldRow
                key={f.field_id}
                field={f}
                onCard={cardFieldIds.includes(f.field_id)}
                onPatch={(patch) => handlePatch(f.field_id, patch)}
                onDelete={() => handleSoftDelete(f.field_id)}
                onToggleCard={() => handleToggleCard(f.field_id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {adding && (
        <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Rótulo</Label>
              <Input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Ex.: Tipo de Telhado"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={draftType} onValueChange={(v) => setDraftType(v as CustomFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!draftLabel.trim()}>
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {deleted.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {deleted.length} campo{deleted.length > 1 ? "s" : ""} removido
            {deleted.length > 1 ? "s" : ""} (dados preservados)
          </summary>
          <div className="mt-2 space-y-1">
            {deleted.map((f) => (
              <div key={f.field_id} className="flex items-center justify-between border border-dashed border-border rounded px-2 py-1">
                <span className="text-muted-foreground line-through">{f.label}</span>
                <Button size="sm" variant="ghost" onClick={() => handleRestore(f.field_id)}>
                  Restaurar
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────

export interface SortableFieldRowProps {
  field: CustomFieldSchema;
  onCard: boolean;
  onPatch: (patch: Partial<CustomFieldSchema>) => void;
  onDelete: () => void;
  onToggleCard: () => void;
}

export const SortableFieldRow = ({
  field,
  onCard,
  onPatch,
  onDelete,
  onToggleCard,
}: SortableFieldRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.field_id,
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
      className="border border-border rounded-md p-3 bg-card space-y-3"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground hover:text-foreground p-1"
          aria-label="Reordenar campo"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <Input
          value={field.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          className="flex-1 h-8 font-medium"
        />

        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {TYPE_LABELS[field.type]}
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleCard}
          title={onCard ? "Ocultar do card Kanban" : "Mostrar no card Kanban"}
        >
          {onCard ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label="Remover campo"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Chave</Label>
          <Input
            value={field.key}
            onChange={(e) => onPatch({ key: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`req-${field.field_id}`}
              checked={field.required}
              onCheckedChange={(checked) => onPatch({ required: checked })}
            />
            <Label htmlFor={`req-${field.field_id}`} className="text-xs">
              Obrigatório
            </Label>
          </div>
        </div>
      </div>

      {(field.type === "select" || field.type === "multi_select") && (
        <OptionsEditor
          field={field}
          onPatch={(opts) => onPatch({ options: opts })}
        />
      )}

      {/* Sprint 6.4 W2 — description trains the Copilot on what this field means */}
      <div>
        <Label className="text-xs text-muted-foreground">
          Descrição (treina o copiloto)
        </Label>
        <Textarea
          value={field.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value || undefined })}
          rows={2}
          className="mt-1 text-xs resize-none"
          placeholder="Ex.: Potência do sistema fotovoltaico em kWp."
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// OptionsEditor — keeps a raw textarea string in local state so pressing
// Enter creates a real new line. The parsed `options` array (trimmed,
// blanks dropped) is what gets emitted; the in-flight text only flushes
// back from props when the field_id changes.
// ─────────────────────────────────────────────────────────────────────

interface OptionsEditorProps {
  field: CustomFieldSchema;
  onPatch: (options: string[]) => void;
}

const OptionsEditor = ({ field, onPatch }: OptionsEditorProps) => {
  const [text, setText] = useState(() => (field.options ?? []).join("\n"));

  // Resync when switching to a different field. Deliberately keyed by
  // field_id only — we don't want prop churn to reset user typing.
  useEffect(() => {
    setText((field.options ?? []).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.field_id]);

  const handleChange = (raw: string) => {
    setText(raw);
    const parsed = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onPatch(parsed);
  };

  return (
    <div>
      <Label className="text-xs">Opções (uma por linha)</Label>
      <Textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        className="text-xs font-mono mt-1"
        placeholder="Opção 1&#10;Opção 2"
      />
    </div>
  );
};
