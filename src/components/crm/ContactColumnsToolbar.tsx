import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  newFieldId,
  slugify,
  TYPE_LABELS,
} from "@/components/crm/pipeline-settings/CustomFieldsEditor";
import type { CustomFieldSchema, CustomFieldType } from "@/types/pipelines";

interface ContactColumnsToolbarProps {
  onCreate: (field: CustomFieldSchema) => void;
  existingKeys?: string[];
  disabled?: boolean;
}

export function ContactColumnsToolbar({
  onCreate,
  existingKeys = [],
  disabled,
}: ContactColumnsToolbarProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");

  const create = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const baseKey = slugify(trimmed) || `campo_${Date.now()}`;
    const taken = new Set(existingKeys);
    let key = baseKey;
    let suffix = 2;
    while (taken.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    onCreate({
      field_id: newFieldId(),
      key,
      label: trimmed,
      type,
      required: false,
      position: Date.now(),
    });
    setLabel("");
    setType("text");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nova coluna"
        className="h-8 w-44"
      />
      <Select value={type} onValueChange={(value) => setType(value as CustomFieldType)}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((item) => (
            <SelectItem key={item} value={item}>
              {TYPE_LABELS[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" onClick={create} disabled={disabled || !label.trim()}>
        <Plus className="mr-1 h-4 w-4" />
        Coluna
      </Button>
    </div>
  );
}
