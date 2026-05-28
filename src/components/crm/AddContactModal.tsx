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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Mail, User, AlertTriangle, Briefcase } from "lucide-react";
import type { OriginCategory } from "@/types/crm";
import {
  ORIGIN_GROUPS,
  ORIGIN_GROUP_LABELS,
  originOptionsByGroup,
} from "@/config/originTaxonomy";
import { useLeadDuplicateCheck } from "@/hooks/useLeadDuplicateCheck";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { useCreateContactAtomic, type CreateContactAtomicResult } from "@/hooks/useCreateContactAtomic";
import { toast } from "sonner";

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (result: CreateContactAtomicResult) => void;
}

/**
 * Sprint 4 EPIC 3 §3.3 — MECE origin picker replaces the Sprint 3 single
 * `origin` enum. Users now tag contacts with an inbound / outbound / network /
 * system category plus a free-text detail (campaign name, referrer, event).
 *
 * Legacy stage picker and opportunity_value were dropped: Contacts are identity
 * only; the follow-up "Adicionar a Pipeline" flow (Epic 4) creates the
 * Opportunity with stage + value.
 *
 * Sprint 5.1 T4 — Pipeline routing toggle: users can now optionally route the
 * new contact directly into a pipeline stage, creating the contact and
 * opportunity atomically in one transaction.
 */
export const AddContactModal = ({ open, onClose, onCreated }: AddContactModalProps) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    observations: "",
    origin_category: "" as OriginCategory | "",
    origin_detail: "",
  });

  // Sprint 5.1 T4 — pipeline routing state
  const [routeToPipeline, setRouteToPipeline] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [selectedStageId, setSelectedStageId] = useState<string>("");

  const { activePipelines } = usePipelines();
  const { stages } = usePipelineStagesV2(selectedPipelineId || undefined);
  const createAtomic = useCreateContactAtomic();

  const { matches: duplicateMatches } = useLeadDuplicateCheck({
    phone: formData.phone,
    email: formData.email,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      observations: "",
      origin_category: "",
      origin_detail: "",
    });
    setRouteToPipeline(false);
    setSelectedPipelineId("");
    setSelectedStageId("");
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    if (routeToPipeline && !selectedPipelineId) {
      toast.error("Selecione uma pipeline ou desligue o encaminhamento.");
      return;
    }

    createAtomic.mutate(
      {
        contact: {
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          observations: formData.observations || undefined,
          source: formData.origin_category || "Manual",
          origin: "manual",
          origin_category: formData.origin_category || null,
          origin_detail: formData.origin_detail || null,
        },
        routing: routeToPipeline
          ? { pipelineId: selectedPipelineId, stageId: selectedStageId || null }
          : undefined,
      },
      {
        onSuccess: (result) => {
          onCreated?.(result);
          resetForm();
          onClose();
        },
      },
    );
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Contato</DialogTitle>
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
                placeholder="Nome do contato"
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

          <div>
            <Label htmlFor="add-origin">Origem</Label>
            <Select
              value={formData.origin_category || "__none__"}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  origin_category: value === "__none__" ? "" : (value as OriginCategory),
                }))
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {ORIGIN_GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{ORIGIN_GROUP_LABELS[group]}</SelectLabel>
                    {originOptionsByGroup(group).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="add-origin-detail">Detalhe da Origem</Label>
            <Input
              id="add-origin-detail"
              className="mt-1.5"
              value={formData.origin_detail}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, origin_detail: e.target.value }))
              }
              placeholder="Ex.: nome da campanha, evento, indicador..."
            />
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
              placeholder="Notas sobre este contato..."
            />
          </div>

          {/* Sprint 5.1 T4 — Pipeline routing toggle */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="route-to-pipeline" className="text-sm font-medium cursor-pointer">
                    Encaminhar para Funil de Vendas
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Criar contato e já adicioná-lo a uma etapa
                  </p>
                </div>
              </div>
              <Switch
                id="route-to-pipeline"
                checked={routeToPipeline}
                onCheckedChange={(checked) => {
                  setRouteToPipeline(checked);
                  if (!checked) {
                    setSelectedPipelineId("");
                    setSelectedStageId("");
                  }
                }}
              />
            </div>

            {routeToPipeline && (
              <div className="space-y-2 pl-6 border-l-2 border-primary/30">
                <div>
                  <Label htmlFor="add-pipeline" className="text-xs">
                    Pipeline *
                  </Label>
                  <Select
                    value={selectedPipelineId}
                    onValueChange={(val) => {
                      setSelectedPipelineId(val);
                      setSelectedStageId("");
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione uma pipeline" />
                    </SelectTrigger>
                    <SelectContent>
                      {activePipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPipelineId && (
                  <div>
                    <Label htmlFor="add-stage" className="text-xs">
                      Etapa *
                    </Label>
                    <Select
                      value={selectedStageId}
                      onValueChange={setSelectedStageId}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione uma etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages
                          .filter((s) => s.pipeline_id === selectedPipelineId)
                          .sort((a, b) => a.position - b.position)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: s.color }}
                                />
                                {s.name}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              !formData.name.trim() ||
              createAtomic.isPending ||
              (routeToPipeline && !selectedPipelineId)
            }
          >
            {routeToPipeline ? "Criar e Encaminhar" : "Adicionar Contato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
