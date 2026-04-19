import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Mail, DollarSign, User, AlertTriangle } from "lucide-react";
import { PipelineStage } from "@/types/crm";
import type { LeadOrigin } from "@/types/pipelines";
import { useLeadDuplicateCheck } from "@/hooks/useLeadDuplicateCheck";

interface AddLeadModalProps {
  open: boolean;
  stages: PipelineStage[];
  onClose: () => void;
  onAdd: (data: {
    name: string;
    email?: string;
    phone?: string;
    stage_id?: string;
    observations?: string;
    source?: string;
    origin?: LeadOrigin;
    opportunity_value?: number;
  }) => void;
}

const ORIGIN_OPTIONS: Array<{ value: LeadOrigin; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "web", label: "Site / Web" },
  { value: "import", label: "Importação" },
];

export const AddLeadModal = ({ open, stages, onClose, onAdd }: AddLeadModalProps) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    stage_id: "",
    valor: "",
    observations: "",
    source: "Manual",
    origin: "manual" as LeadOrigin,
  });

  const { matches: duplicateMatches } = useLeadDuplicateCheck({
    phone: formData.phone,
    email: formData.email,
  });

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    const valorNumerico = formData.valor ? parseCurrency(formData.valor) : undefined;

    onAdd({
      name: formData.name,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      stage_id: formData.stage_id || undefined,
      observations: formData.observations || undefined,
      source: formData.source,
      origin: formData.origin,
      opportunity_value: valorNumerico,
    });

    setFormData({
      name: "",
      email: "",
      phone: "",
      stage_id: stages[0]?.id || "",
      valor: "",
      observations: "",
      source: "Manual",
      origin: "manual",
    });
  };

  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    if (!numericValue) return "";
    const number = parseInt(numericValue, 10) / 100;
    return number.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const parseCurrency = (value: string): number => {
    const numericValue = value.replace(/\D/g, "");
    return parseInt(numericValue, 10) / 100;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="add-name">Nome *</Label>
            <div className="relative mt-1.5">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="add-name"
                className="pl-9"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nome do lead"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="add-phone">Telefone</Label>
              <div className="relative mt-1.5">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="add-phone"
                  className="pl-9"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="add-email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="add-email"
                  type="email"
                  className="pl-9"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
          </div>

          {/* Non-blocking duplicate warning */}
          {duplicateMatches.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Possível duplicado{duplicateMatches.length > 1 ? "s" : ""} encontrado
                    {duplicateMatches.length > 1 ? "s" : ""}:
                  </p>
                  <ul className="text-xs text-foreground/80 space-y-0.5">
                    {duplicateMatches.slice(0, 3).map((m) => (
                      <li key={m.id}>
                        <span className="font-medium">{m.name}</span>{" "}
                        <span className="text-muted-foreground">
                          ({m.matchedField === "phone" ? "telefone" : "email"}: {m.matchedValue})
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Você ainda pode prosseguir — duplicação não é bloqueada.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="add-stage">Etapa</Label>
              <Select
                value={formData.stage_id}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, stage_id: value }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="add-valor">Valor</Label>
              <div className="relative mt-1.5">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="add-valor"
                  className="pl-9"
                  value={formData.valor}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      valor: formatCurrency(e.target.value),
                    }))
                  }
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="add-origin">Origem</Label>
              <Select
                value={formData.origin}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, origin: value as LeadOrigin }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="add-source">Fonte de Captação</Label>
              <Select
                value={formData.source}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, source: value }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="Ads">Ads (Tráfego Pago)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="add-observations">Observações</Label>
            <Textarea
              id="add-observations"
              value={formData.observations}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, observations: e.target.value }))
              }
              rows={3}
              className="mt-1.5 resize-none"
              placeholder="Notas sobre este lead..."
            />
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!formData.name.trim()}
          >
            Adicionar Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
