import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type {
  CustomFieldSchema,
  CustomFieldType,
} from "@/types/pipelines";

type CustomDataValue = string | number | boolean | null | undefined;
type CustomDataMap = Record<string, unknown>;

interface DynamicFieldRendererProps {
  schema: CustomFieldSchema[];
  value: CustomDataMap;
  onChange: (next: CustomDataMap) => void;
  disabled?: boolean;
  /** When true, hides fields with `is_deleted: true` (default true). */
  hideDeleted?: boolean;
  /** Layout: "stack" (default) or "grid" two columns. */
  layout?: "stack" | "grid";
}

/**
 * The single source of truth for rendering tenant-defined custom fields.
 * Used by:
 *   • PipelineSettings → custom field preview / value editor
 *   • LeadDetailsModal → opportunity custom_data section
 *   • CRMContextPanel (Sprint 3 EPIC 4)
 *   • Kanban card (Sprint 3 EPIC 3)
 *
 * Stable rule: values are keyed by `field_id`, never by `key` or `label`.
 */
export const DynamicFieldRenderer = ({
  schema,
  value,
  onChange,
  disabled = false,
  hideDeleted = true,
  layout = "stack",
}: DynamicFieldRendererProps) => {
  const visibleSchema = useMemo(() => {
    const filtered = hideDeleted
      ? schema.filter((f) => !f.is_deleted)
      : schema;
    return [...filtered].sort((a, b) => a.position - b.position);
  }, [schema, hideDeleted]);

  if (visibleSchema.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Nenhum campo personalizado configurado.
      </p>
    );
  }

  const handleField = (fieldId: string, next: CustomDataValue) => {
    const updated = { ...value, [fieldId]: next };
    onChange(updated);
  };

  return (
    <div
      className={cn(
        layout === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 gap-4"
          : "flex flex-col gap-4",
      )}
    >
      {visibleSchema.map((field) => (
        <FieldInput
          key={field.field_id}
          field={field}
          value={value[field.field_id] as CustomDataValue}
          onChange={(next) => handleField(field.field_id, next)}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Single field renderer — switch on type
// ─────────────────────────────────────────────────────────────────────

interface FieldInputProps {
  field: CustomFieldSchema;
  value: CustomDataValue;
  onChange: (next: CustomDataValue) => void;
  disabled: boolean;
}

const FieldInput = ({ field, value, onChange, disabled }: FieldInputProps) => {
  const inputId = `cf-${field.field_id}`;
  const required = field.required;

  const labelNode = (
    <Label htmlFor={inputId} className="text-xs uppercase tracking-wide text-muted-foreground">
      {field.label}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );

  switch (field.type) {
    case "text":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={inputId}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            placeholder={field.description}
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={inputId}
            type="number"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === "" ? null : Number(raw));
            }}
            disabled={disabled}
            placeholder={field.description}
          />
        </div>
      );

    case "currency":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              R$
            </span>
            <Input
              id={inputId}
              type="number"
              step="0.01"
              className="pl-9"
              value={value === null || value === undefined ? "" : String(value)}
              onChange={(e) => {
                const raw = e.target.value;
                onChange(raw === "" ? null : Number(raw));
              }}
              disabled={disabled}
              placeholder="0,00"
            />
          </div>
        </div>
      );

    case "date": {
      const dateValue = value ? new Date(value as string) : undefined;
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={inputId}
                variant="outline"
                disabled={disabled}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !dateValue && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateValue
                  ? format(dateValue, "PPP", { locale: ptBR })
                  : "Selecione a data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateValue}
                onSelect={(d) => onChange(d ? d.toISOString() : null)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      );
    }

    case "boolean":
      return (
        <div className="flex items-center justify-between gap-3 py-2">
          <Label htmlFor={inputId} className="text-sm font-medium">
            {field.label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Switch
            id={inputId}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Select
            value={(value as string) ?? "__none__"}
            onValueChange={(v) => onChange(v === "__none__" ? null : v)}
            disabled={disabled}
          >
            <SelectTrigger id={inputId}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {!required && <SelectItem value="__none__">—</SelectItem>}
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    default: {
      const _exhaustive: never = field.type as never;
      void _exhaustive;
      return null;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────
// Validation helper — used by save buttons before persisting
// ─────────────────────────────────────────────────────────────────────

export interface FieldValidationError {
  field_id: string;
  label: string;
  message: string;
}

export const validateCustomData = (
  schema: CustomFieldSchema[],
  data: CustomDataMap,
): FieldValidationError[] => {
  const errors: FieldValidationError[] = [];
  for (const field of schema) {
    if (field.is_deleted) continue;
    const v = data[field.field_id];
    if (field.required && (v === undefined || v === null || v === "")) {
      errors.push({
        field_id: field.field_id,
        label: field.label,
        message: `${field.label} é obrigatório`,
      });
    }
    if (
      field.type === "select" &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      field.options &&
      !field.options.includes(v as string)
    ) {
      errors.push({
        field_id: field.field_id,
        label: field.label,
        message: `${field.label}: opção inválida`,
      });
    }
  }
  return errors;
};

export const isCustomFieldType = (s: string): s is CustomFieldType =>
  ["text", "number", "currency", "date", "boolean", "select"].includes(s);
