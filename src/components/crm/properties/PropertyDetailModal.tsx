import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useProperties, useProperty } from "@/hooks/useProperties";
import type {
  Property,
  PropertyAddress,
  PropertyType,
} from "@/types/crm";

const TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "address", label: "Endereço" },
  { value: "site", label: "Site / Obra" },
  { value: "unit", label: "Unidade" },
  { value: "custom", label: "Outro" },
];

interface PropertyDetailModalProps {
  propertyId: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Property identity + address + attributes editor. Referenced from
 * PropertySection rows (click on a linked property row). Does NOT manage
 * ownership links — those live on the parent container (Company/Contact/Opp
 * detail modals). Keeps this modal reusable regardless of the drill-in path.
 */
export const PropertyDetailModal = ({
  propertyId,
  open,
  onClose,
}: PropertyDetailModalProps) => {
  const { data: property, isLoading } = useProperty(propertyId);
  const { updateProperty, deleteProperty } = useProperties();

  const [form, setForm] = useState<Partial<Property>>({});

  useEffect(() => {
    if (property) setForm({ ...property });
  }, [property]);

  const address: PropertyAddress = (form.address as PropertyAddress) ?? {};

  const patchAddress = (patch: Partial<PropertyAddress>) => {
    const next = { ...address, ...patch };
    // Strip empty strings so persisted JSON stays compact.
    (Object.keys(next) as Array<keyof PropertyAddress>).forEach((k) => {
      if (!next[k]) delete next[k];
    });
    setForm((prev) => ({
      ...prev,
      address: Object.keys(next).length === 0 ? null : (next as PropertyAddress),
    }));
  };

  const handleSave = () => {
    if (!property) return;
    updateProperty.mutate({
      id: property.id,
      label: form.label ?? property.label,
      property_type: (form.property_type ?? property.property_type) as PropertyType,
      address: (form.address as PropertyAddress | null) ?? null,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!property) return;
    if (!confirm("Remover esta propriedade? Vínculos existentes serão preservados em histórico.")) return;
    deleteProperty.mutate(property.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{property?.label ?? "Propriedade"}</DialogTitle>
        </DialogHeader>

        {isLoading || !property ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Rótulo</Label>
                  <Input
                    value={form.label ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={form.property_type ?? "address"}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, property_type: v as PropertyType }))
                    }
                  >
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

              <div className="pt-3 border-t border-border">
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                  Endereço
                </h4>
                <div className="grid grid-cols-6 gap-2">
                  <Input
                    className="col-span-4"
                    placeholder="Rua"
                    value={address.street ?? ""}
                    onChange={(e) => patchAddress({ street: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Número"
                    value={address.number ?? ""}
                    onChange={(e) => patchAddress({ number: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Complemento"
                    value={address.complement ?? ""}
                    onChange={(e) => patchAddress({ complement: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Bairro"
                    value={address.neighborhood ?? ""}
                    onChange={(e) => patchAddress({ neighborhood: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Cidade"
                    value={address.city ?? ""}
                    onChange={(e) => patchAddress({ city: e.target.value })}
                  />
                  <Input
                    className="col-span-1"
                    placeholder="UF"
                    maxLength={2}
                    value={address.state ?? ""}
                    onChange={(e) => patchAddress({ state: e.target.value.toUpperCase() })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="CEP"
                    value={address.zip ?? ""}
                    onChange={(e) => patchAddress({ zip: e.target.value })}
                  />
                  <Input
                    className="col-span-6"
                    placeholder="País"
                    value={address.country ?? ""}
                    onChange={(e) => patchAddress({ country: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.latitude ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        latitude: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.longitude ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        longitude: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex items-center sm:justify-between gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-destructive"
            disabled={!property}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!property || updateProperty.isPending}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
