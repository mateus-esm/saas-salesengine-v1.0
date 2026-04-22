import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { EntityLinker, type EntityKind } from "./EntityLinker";

import type {
  AddressValue,
  CustomFieldSchema,
  CustomFieldType,
} from "@/types/pipelines";

type CustomDataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | AddressValue;
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
 *   • ContactDetailsModal → personal_custom_data enrichment block
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

    case "multi_select":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <MultiSelectField
            inputId={inputId}
            options={field.options ?? []}
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={(next) => onChange(next.length === 0 ? null : next)}
            disabled={disabled}
          />
        </div>
      );

    case "url":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={inputId}
            type="url"
            inputMode="url"
            pattern="https?://.+"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            placeholder={field.description || "https://exemplo.com"}
          />
        </div>
      );

    case "phone":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={inputId}
            type="tel"
            inputMode="tel"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            placeholder={field.description || "+55 11 90000-0000"}
          />
        </div>
      );

    case "address":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <AddressField
            value={(value as AddressValue | null | undefined) ?? {}}
            onChange={(next) => onChange(Object.keys(next).length === 0 ? null : next)}
            disabled={disabled}
          />
        </div>
      );

    case "company_ref":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <EntityRefField
            entity="company"
            value={(value as string) ?? null}
            onChange={(next) => onChange(next)}
            disabled={disabled}
          />
        </div>
      );

    case "property_ref":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <EntityRefField
            entity="property"
            value={(value as string) ?? null}
            onChange={(next) => onChange(next)}
            disabled={disabled}
          />
        </div>
      );

    case "contact_ref":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <EntityRefField
            entity="contact"
            value={(value as string) ?? null}
            onChange={(next) => onChange(next)}
            disabled={disabled}
          />
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
// Sprint 4 EPIC 1 subcomponents
// ─────────────────────────────────────────────────────────────────────

interface MultiSelectFieldProps {
  inputId: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}

const MultiSelectField = ({ inputId, options, value, onChange, disabled }: MultiSelectFieldProps) => {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);

  const toggle = (opt: string) => {
    if (selected.has(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={inputId}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between min-h-10 h-auto flex-wrap gap-1 py-1.5"
        >
          <div className="flex flex-wrap gap-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground text-sm">Selecione uma ou mais</span>
            ) : (
              value.map((v) => (
                <Badge key={v} variant="secondary" className="text-xs">
                  {v}
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar opção..." />
          <CommandList>
            <CommandEmpty>Nenhuma opção.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem key={opt} value={opt} onSelect={() => toggle(opt)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected.has(opt) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface AddressFieldProps {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  disabled: boolean;
}

const AddressField = ({ value, onChange, disabled }: AddressFieldProps) => {
  const patch = (k: keyof AddressValue, v: string) => {
    const next = { ...value, [k]: v || undefined };
    // Strip keys with empty values so the persisted JSON stays compact.
    Object.keys(next).forEach((key) => {
      if ((next as Record<string, string | undefined>)[key] === undefined) {
        delete (next as Record<string, string | undefined>)[key];
      }
    });
    onChange(next);
  };

  return (
    <div className="grid grid-cols-6 gap-2">
      <Input
        className="col-span-4"
        placeholder="Rua"
        value={value.street ?? ""}
        onChange={(e) => patch("street", e.target.value)}
        disabled={disabled}
      />
      <Input
        className="col-span-2"
        placeholder="Número"
        value={value.number ?? ""}
        onChange={(e) => patch("number", e.target.value)}
        disabled={disabled}
      />
      <Input
        className="col-span-3"
        placeholder="Complemento"
        value={value.complement ?? ""}
        onChange={(e) => patch("complement", e.target.value)}
        disabled={disabled}
      />
      <Input
        className="col-span-3"
        placeholder="Bairro"
        value={value.neighborhood ?? ""}
        onChange={(e) => patch("neighborhood", e.target.value)}
        disabled={disabled}
      />
      <Input
        className="col-span-3"
        placeholder="Cidade"
        value={value.city ?? ""}
        onChange={(e) => patch("city", e.target.value)}
        disabled={disabled}
      />
      <Input
        className="col-span-1"
        placeholder="UF"
        maxLength={2}
        value={value.state ?? ""}
        onChange={(e) => patch("state", e.target.value.toUpperCase())}
        disabled={disabled}
      />
      <Input
        className="col-span-2"
        placeholder="CEP"
        value={value.zip ?? ""}
        onChange={(e) => patch("zip", e.target.value)}
        disabled={disabled}
      />
      <Input
        className="col-span-6"
        placeholder="País"
        value={value.country ?? ""}
        onChange={(e) => patch("country", e.target.value)}
        disabled={disabled}
      />
    </div>
  );
};

// Tenant-scoped entity picker — thin wrapper around the shared EntityLinker.
// EPIC 1 introduced a bespoke Popover+Command for ref fields; EPIC 4 promoted
// that logic into `EntityLinker` so assignment flows and custom-field values
// share the same UX. Custom fields don't support create-inline today (users
// create entities from Companies / Contacts pages); we pass no `onCreateStart`.

interface EntityRefFieldProps {
  entity: EntityKind;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled: boolean;
}

const EntityRefField = ({ entity, value, onChange, disabled }: EntityRefFieldProps) => {
  return (
    <EntityLinker
      entity={entity}
      selected={value}
      onSelect={(id) => onChange(id)}
      onClear={() => onChange(null)}
      disabled={disabled}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────
// Validation helper — used by save buttons before persisting
// ─────────────────────────────────────────────────────────────────────

export interface FieldValidationError {
  field_id: string;
  label: string;
  message: string;
}

const URL_PATTERN = /^https?:\/\/.+/i;

export const validateCustomData = (
  schema: CustomFieldSchema[],
  data: CustomDataMap,
): FieldValidationError[] => {
  const errors: FieldValidationError[] = [];
  for (const field of schema) {
    if (field.is_deleted) continue;
    const v = data[field.field_id];
    const isEmpty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (field.type === "address" &&
        typeof v === "object" &&
        Object.keys(v as Record<string, unknown>).length === 0);

    if (field.required && isEmpty) {
      errors.push({
        field_id: field.field_id,
        label: field.label,
        message: `${field.label} é obrigatório`,
      });
      continue;
    }
    if (isEmpty) continue;

    if (
      field.type === "select" &&
      field.options &&
      !field.options.includes(v as string)
    ) {
      errors.push({
        field_id: field.field_id,
        label: field.label,
        message: `${field.label}: opção inválida`,
      });
    }
    if (field.type === "multi_select" && field.options) {
      const invalid = (v as string[]).filter((x) => !field.options!.includes(x));
      if (invalid.length > 0) {
        errors.push({
          field_id: field.field_id,
          label: field.label,
          message: `${field.label}: opção inválida (${invalid.join(", ")})`,
        });
      }
    }
    if (field.type === "url" && typeof v === "string" && !URL_PATTERN.test(v)) {
      errors.push({
        field_id: field.field_id,
        label: field.label,
        message: `${field.label}: URL inválida (use http:// ou https://)`,
      });
    }
  }
  return errors;
};

const ALL_FIELD_TYPES: readonly CustomFieldType[] = [
  "text", "number", "currency", "date", "boolean", "select",
  "multi_select", "url", "phone", "address",
  "property_ref", "company_ref", "contact_ref",
];

export const isCustomFieldType = (s: string): s is CustomFieldType =>
  (ALL_FIELD_TYPES as readonly string[]).includes(s);
