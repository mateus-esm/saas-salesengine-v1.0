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

import { useCompanies } from "@/hooks/useCompanies";
import type { Company, CompanySizeBracket } from "@/types/crm";

const SIZE_OPTIONS: Array<{ value: CompanySizeBracket; label: string }> = [
  { value: "solo", label: "Solo (1)" },
  { value: "2-10", label: "2–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-1000", label: "201–1000" },
  { value: "1000+", label: "1000+" },
];

interface AddCompanyModalProps {
  open: boolean;
  onClose: () => void;
  /** Initial value to pre-fill `name` (used when EntityLinker passes the
   *  search term the user had typed when they clicked "Criar nova empresa"). */
  initialName?: string;
  /** Invoked with the created Company. Linker callers use this to immediately
   *  select the new row after the dialog closes. */
  onCreated?: (company: Company) => void;
}

/**
 * Sprint 4 EPIC 4 — quick create dialog. Lean on required fields (name only);
 * the full identity / custom_data edit happens in CompanyDetailModal.
 */
export const AddCompanyModal = ({
  open,
  onClose,
  initialName,
  onCreated,
}: AddCompanyModalProps) => {
  const { createCompany } = useCompanies();
  const [name, setName] = useState(initialName ?? "");
  const [industry, setIndustry] = useState("");
  const [sizeBracket, setSizeBracket] = useState<CompanySizeBracket | "">("");

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setIndustry("");
      setSizeBracket("");
    }
  }, [open, initialName]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createCompany.mutateAsync({
        name: trimmed,
        industry: industry.trim() || null,
        size_bracket: sizeBracket || null,
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
          <DialogTitle>Nova Empresa</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Solar Brasil Ltda."
              autoFocus
            />
          </div>
          <div>
            <Label>Setor</Label>
            <Input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Ex.: Energia Renovável"
            />
          </div>
          <div>
            <Label>Tamanho</Label>
            <Select
              value={sizeBracket || "__none__"}
              onValueChange={(v) =>
                setSizeBracket(v === "__none__" ? "" : (v as CompanySizeBracket))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {SIZE_OPTIONS.map((opt) => (
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
            disabled={!name.trim() || createCompany.isPending}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
