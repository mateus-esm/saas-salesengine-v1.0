import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { usePipelines } from "@/hooks/usePipelines";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useLeads } from "@/hooks/useLeads";

interface AssignToPipelineDialogProps {
  open: boolean;
  onClose: () => void;
  /** One or more contact ids to assign. When multiple are passed, one
   *  opportunity per contact is created in the same pipeline. */
  contactIds: string[];
  /** Optional label for the dialog (e.g., the contact's name when single). */
  label?: string;
  /** Pre-select a pipeline (used by deep-links and the Assign row action from
   *  inside a pipeline workspace). */
  defaultPipelineId?: string | null;
}

/**
 * Sprint 4 EPIC 4 §4.3.1 — "Assign Contact to Pipeline" flow. Creates one
 * opportunity per selected contact in the first stage of the chosen pipeline.
 *
 * Also performs the contact_type bump: contacts currently typed as 'lead' are
 * promoted to 'opportunity' since they now live inside a sales process. This
 * matches the Epic 0 webhook behavior for inbound leads.
 */
export const AssignToPipelineDialog = ({
  open,
  onClose,
  contactIds,
  label,
  defaultPipelineId,
}: AssignToPipelineDialogProps) => {
  const { activePipelines } = usePipelines();
  const { createOpportunity } = useOpportunities();
  const { leads, updateLead } = useLeads();

  const [pipelineId, setPipelineId] = useState<string>(defaultPipelineId ?? "");

  useEffect(() => {
    if (open) {
      setPipelineId(defaultPipelineId ?? "");
    }
  }, [open, defaultPipelineId]);

  const handleAssign = async () => {
    if (!pipelineId || contactIds.length === 0) return;

    // Sequential to respect any server-side rate limits and keep the toasts
    // ordered per contact; at typical bulk sizes the perf hit is negligible.
    for (const contactId of contactIds) {
      try {
        await createOpportunity.mutateAsync({
          lead_id: contactId,
          pipeline_id: pipelineId,
        });

        // contact_type bump — promote leads to opportunities when they enter
        // a sales process. Leave other types alone (contact/spam/archived).
        const contact = leads.find((l) => l.id === contactId);
        if (contact?.contact_type === "lead") {
          updateLead.mutate({ id: contactId, contact_type: "opportunity" });
        }
      } catch {
        // Per-row error toast surfaces from the hook; keep looping so a single
        // failure doesn't abort the bulk assign.
      }
    }

    onClose();
  };

  const title =
    contactIds.length > 1
      ? `Adicionar ${contactIds.length} contatos a uma Pipeline`
      : label
        ? `Adicionar "${label}" a uma Pipeline`
        : "Adicionar contato a uma Pipeline";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Pipeline *</Label>
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger>
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
            <p className="text-xs text-muted-foreground mt-1">
              O lead será criado na primeira etapa da pipeline escolhida.
              Contatos do tipo "lead" são promovidos automaticamente para
              "oportunidade".
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!pipelineId || createOpportunity.isPending || contactIds.length === 0}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
