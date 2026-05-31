import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import type { CustomFieldSchema } from "@/types/pipelines";

export const NATIVE_CARD_FIELDS = [
  { field_id: "native:value", label: "Valor da oportunidade", group: "Nativo" },
  { field_id: "native:time_in_phase", label: "Tempo na Fase", group: "Nativo" },
  { field_id: "native:touchpoints", label: "Interações", group: "Nativo" },
  { field_id: "native:next_contact", label: "Próximo Contato", group: "Nativo" },
  { field_id: "native:whatsapp", label: "WhatsApp do contato", group: "Nativo" },
] as const;

export type NativeCardFieldId = (typeof NATIVE_CARD_FIELDS)[number]["field_id"];

interface CardFieldsPickerProps {
  schema: CustomFieldSchema[];
  cardFieldIds: string[];
  onChange: (next: string[]) => void;
}

/**
 * Admin-side configuration for which native and custom fields appear on the
 * Kanban card face. Writes to `pipelines.card_field_ids`.
 */
export const CardFieldsPicker = ({ schema, cardFieldIds, onChange }: CardFieldsPickerProps) => {
  const visible = useMemo(
    () => schema.filter((f) => !f.is_deleted).sort((a, b) => a.position - b.position),
    [schema],
  );

  const toggle = (fieldId: string, checked: boolean) => {
    if (checked) {
      if (cardFieldIds.includes(fieldId)) return;
      onChange([...cardFieldIds, fieldId]);
    } else {
      onChange(cardFieldIds.filter((id) => id !== fieldId));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Selecione quais informações aparecem no rosto do card do Kanban.
      </p>

      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Nativos
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {NATIVE_CARD_FIELDS.map((f) => {
            const checked = cardFieldIds.includes(f.field_id);
            return (
              <label
                key={f.field_id}
                className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/30 cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => toggle(f.field_id, !!v)}
                />
                <Label className="text-sm font-medium cursor-pointer">{f.label}</Label>
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Personalizados
        </p>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground italic flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Nenhum campo personalizado para exibir.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visible.map((f) => {
              const checked = cardFieldIds.includes(f.field_id);
              return (
                <label
                  key={f.field_id}
                  className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/30 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggle(f.field_id, !!v)}
                  />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium cursor-pointer">{f.label}</Label>
                    <p className="text-xs text-muted-foreground">{f.type}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
