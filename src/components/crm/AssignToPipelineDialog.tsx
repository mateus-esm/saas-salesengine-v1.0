import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePipelines } from "@/hooks/usePipelines";

const sb = supabase as any;

interface AssignToPipelineDialogProps {
  open: boolean;
  onClose: () => void;
  /** One or more contact ids. One deal per contact is created in the pipeline. */
  contactIds: string[];
  /** Optional label for the dialog (e.g., the contact's name when single). */
  label?: string;
  /** Pre-select a pipeline. */
  defaultPipelineId?: string | null;
}

/**
 * Sprint 4 EPIC 4 §4.3.1 — "Assign Contact to Pipeline". Sprint 11 · Onda 2: one
 * call to the business verb `crm_create_opportunities` (one deal per contact, in
 * the first open stage; contacts that already have an open deal in that
 * pipeline are skipped; "lead" contacts become "opportunity"). Before, it
 * created the deals one request at a time and loaded every lead and deal of the
 * team to do it.
 */
export const AssignToPipelineDialog = ({
  open,
  onClose,
  contactIds,
  label,
  defaultPipelineId,
}: AssignToPipelineDialogProps) => {
  const { activePipelines } = usePipelines();
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();

  const [pipelineId, setPipelineId] = useState<string>(defaultPipelineId ?? "");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) setPipelineId(defaultPipelineId ?? "");
  }, [open, defaultPipelineId]);

  const handleAssign = async () => {
    if (!pipelineId || contactIds.length === 0) return;
    setRunning(true);
    try {
      const { data, error } = await sb.rpc("crm_create_opportunities", {
        p_lead_ids: contactIds,
        p_pipeline_id: pipelineId,
      });
      if (error) throw error;
      const created = Number(data?.created) || 0;
      const skipped = Number(data?.skipped) || 0;
      if (created > 0) {
        toast.success(
          `${created} ${created === 1 ? "negócio criado" : "negócios criados"}` +
            (skipped > 0 ? ` · ${skipped} já ${skipped === 1 ? "tinha" : "tinham"} negócio aberto nessa pipeline` : ""),
        );
      } else {
        toast.info("Todos já têm um negócio aberto nessa pipeline.");
      }
      queryClient.invalidateQueries({ queryKey: ["contacts_table", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["board", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["opp_table", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível adicionar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
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
            <p className="mt-1 text-xs text-muted-foreground">
              Um negócio por contato, na primeira etapa aberta. Quem já tem um negócio aberto nessa pipeline é pulado.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleAssign} disabled={!pipelineId || running || contactIds.length === 0}>
            {running ? "Adicionando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
