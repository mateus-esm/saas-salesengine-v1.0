import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { useProperties } from "@/hooks/useProperties";
import type { Property, PropertyType } from "@/types/crm";

const TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "address", label: "Endereço" },
  { value: "site", label: "Site / Obra" },
  { value: "unit", label: "Unidade" },
  { value: "custom", label: "Outro" },
];

interface AddPropertyModalProps {
  open: boolean;
  onClose: () => void;
  initialLabel?: string;
  onCreated?: (property: Property) => void;
}

/**
 * Quick-create for properties. Only label + type are required — full address
 * + attributes edit happens in PropertyDetailModal. Same pattern as
 * AddCompanyModal.
 */
export const AddPropertyModal = ({
  open,
  onClose,
  initialLabel,
  onCreated,
}: AddPropertyModalProps) => {
  const { createProperty } = useProperties();
  const [label, setLabel] = useState(initialLabel ?? "");
  const [propertyType, setPropertyType] = useState<PropertyType>("address");

  useEffect(() => {
    if (open) {
      setLabel(initialLabel ?? "");
      setPropertyType("address");
    }
  }, [open, initialLabel]);

  const handleSubmit = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      const created = await createProperty.mutateAsync({
        label: trimmed,
        property_type: propertyType,
      });
      onCreated?.(created);
      onClose();
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Propriedade</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Rótulo *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Matriz · Usina Solar · Apto 201"
              autoFocus
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={propertyType} onValueChange={(v) => setPropertyType(v as PropertyType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!label.trim() || createProperty.isPending}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
