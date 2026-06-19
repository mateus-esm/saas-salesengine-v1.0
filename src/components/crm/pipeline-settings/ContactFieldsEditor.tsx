/**
 * Sprint 6.4 W2 — "Campos do Contato" editor.
 *
 * Manages the tenant-wide contact-field dictionary stored in
 * `equipes.contact_fields_schema`. Each field row is the same
 * `SortableFieldRow` used in the pipeline custom-fields editor (DRY).
 *
 * The Eye/card-visibility toggle is hidden here (no Kanban card concept
 * for contacts) — we pass onCard=false and a no-op onToggleCard.
 */

import { useMemo, useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { CustomFieldSchema, CustomFieldType } from "@/types/pipelines";
import { useContactFields } from "@/hooks/useContactFields";
import {
  SortableFieldRow,
  TYPE_LABELS,
  slugify,
  newFieldId,
} from "./CustomFieldsEditor";

const TYPES_WITH_OPTIONS: CustomFieldType[] = ["select", "multi_select"];
const TYPES_AS_REF: CustomFieldType[] = [
  "company_ref",
  "property_ref",
  "contact_ref",
];

/**
 * Standalone editor for the tenant contact-field dictionary.
 * Save is explicit (button) — mirrors pipeline CustomFieldsEditor's
 * pattern where edits are buffered locally and committed on "Salvar".
 */
export const ContactFieldsEditor = () => {
  const { fields: remote, isLoading, upsertFields } = useContactFields();

  // Local buffer — identical pattern to PipelineEditor local schema state
  const [schema, setSchema] = useState<CustomFieldSchema[] | null>(null);

  // Initialise buffer once remote data arrives (and only once, so edits don't reset)
  const effective = schema ?? remote;

  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftType, setDraftType] = useState<CustomFieldType>("text");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(
    () =>
      [...effective]
        .filter((f) => !f.is_deleted)
        .sort((a, b) => a.position - b.position),
    [effective],
  );

  const deleted = useMemo(
    () => effective.filter((f) => f.is_deleted),
    [effective],
  );

  const emit = (next: CustomFieldSchema[]) => setSchema(next);

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
    emit([...effective, field]);
    setDraftLabel("");
    setDraftType("text");
    setAdding(false);
  };

  const handlePatch = (field_id: string, patch: Partial<CustomFieldSchema>) => {
    emit(effective.map((f) => (f.field_id === field_id ? { ...f, ...patch } : f)));
  };

  const handleSoftDelete = (field_id: string) => {
    emit(
      effective.map((f) =>
        f.field_id === field_id ? { ...f, is_deleted: true } : f,
      ),
    );
  };

  const handleRestore = (field_id: string) => {
    emit(
      effective.map((f) =>
        f.field_id === field_id ? { ...f, is_deleted: false } : f,
      ),
    );
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
    const map = new Map(reordered.map((f) => [f.field_id, f]));
    emit(effective.map((f) => map.get(f.field_id) ?? f));
  };

  const dirty = schema !== null;

  const handleSave = () => {
    upsertFields.mutate(effective, {
      onSuccess: () => setSchema(null), // reset buffer; remote is now in sync
    });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Campos do Contato</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo campo
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || upsertFields.isPending}
          >
            <Save className="h-4 w-4 mr-1" /> Salvar
          </Button>
        </div>
      </div>

      {visible.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground italic">
          Nenhum campo. Clique em "Novo campo" para adicionar.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visible.map((f) => f.field_id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {visible.map((f) => (
              <SortableFieldRow
                key={f.field_id}
                field={f}
                onCard={false}
                onPatch={(patch) => handlePatch(f.field_id, patch)}
                onDelete={() => handleSoftDelete(f.field_id)}
                onToggleCard={() => {
                  /* card visibility not applicable to contact fields */
                }}
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
                placeholder="Ex.: CPF"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={draftType}
                onValueChange={(v) => setDraftType(v as CustomFieldType)}
              >
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
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!draftLabel.trim()}
            >
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
              <div
                key={f.field_id}
                className="flex items-center justify-between border border-dashed border-border rounded px-2 py-1"
              >
                <span className="text-muted-foreground line-through">
                  {f.label}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRestore(f.field_id)}
                >
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
