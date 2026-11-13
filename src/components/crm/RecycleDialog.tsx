/**
 * Sprint 15b · T4 — mover um negócio para o Reciclo pergunta o motivo e a regra de volta.
 *
 * Irmão do LossReasonDialog: aberto por useMoveToStage quando a etapa-alvo é de
 * ciclo. Fechar (Cancelar, Esc, clicar fora) CANCELA o movimento. Os padrões
 * vêm da etapa (configurados em Configurações do funil) e valem só como ponto de
 * partida: o que se muda aqui vale para este negócio.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOutreachLine } from "@/hooks/useFollowups";
import { validateFollowupForm, type FollowupFormValue } from "@/lib/followups";
import { recycleInitialValue, returnStageOptions, type RecycleStageDefaults, type RecycleStageOption } from "@/lib/recycle";
import { FollowupForm } from "./followups/FollowupForm";

interface Props {
  open: boolean;
  /** Fechou sem confirmar: o negócio não se move. */
  onCancel: () => void;
  /** Motivo e regra preenchidos (já sem "enviar mensagem" se não há linha de WhatsApp). */
  onConfirm: (value: FollowupFormValue, hasLine: boolean) => void;
  /** A etapa de Reciclo de destino (traz os padrões). */
  stage: RecycleStageDefaults | null | undefined;
  /** Etapas do funil; só abertas/ciclo viram opção de "voltar para". */
  stages: RecycleStageOption[];
  targetStageId: string;
  reasons: string[];
  leadName?: string;
  /** Movimento em lote: quantos negócios dividem esta regra. */
  count?: number;
  /** Dono do negócio: responsável padrão. */
  ownerId?: string | null;
}

export function RecycleDialog({ open, onCancel, onConfirm, stage, stages, targetStageId, reasons, leadName, count, ownerId = null }: Props) {
  const line = useOutreachLine();
  const returnable = useMemo(() => returnStageOptions(stages, targetStageId), [stages, targetStageId]);
  const [value, setValue] = useState<FollowupFormValue>(() => recycleInitialValue(stage, ownerId, returnable));

  useEffect(() => {
    if (open) setValue(recycleInitialValue(stage, ownerId, returnable));
    // Só reinicia ao abrir: mudar a lista de etapas com o diálogo aberto não apaga o que foi digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reasonOk = value.reason.trim() !== "";

  const submit = () => {
    // Line check failed (isError): the line is unknown, so the RPC decides.
    const lineOk = line.hasLine || !!line.isError;
    const effective = { ...value, sendMessage: value.sendMessage && lineOk };
    const problem = validateFollowupForm(effective, "recycle", lineOk);
    if (problem) {
      toast.error(problem);
      return;
    }
    onConfirm(effective, lineOk);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Mover para o Reciclo</DialogTitle>
          <DialogDescription className="text-xs">
            {count && count > 1 ? (
              <>A regra escolhida vale para os {count} negócios.</>
            ) : leadName ? (
              <>
                <span className="font-medium text-foreground">{leadName}</span> vai para o Reciclo. Diga por quê e quando voltar a falar.
              </>
            ) : (
              "Diga por que o negócio vai para o Reciclo e quando voltar a falar."
            )}
          </DialogDescription>
        </DialogHeader>

        <FollowupForm
          value={value}
          onChange={setValue}
          mode="recycle"
          stages={returnable}
          reasons={reasons}
          hasLine={line.hasLine}
          lineLabel={line.label}
          lineError={!!line.isError}
          onRetryLine={line.refetch}
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" className="text-xs" disabled={!reasonOk} onClick={submit}>
            Mover para o Reciclo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
