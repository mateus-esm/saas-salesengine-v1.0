// Sprint 15b · T3 — "Agendar follow-up" (manual) de um negócio.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOutreachLine, useScheduleFollowup } from "@/hooks/useFollowups";
import { dueAtFromLocal, initialFollowupValue, validateFollowupForm, type FollowupFormValue } from "@/lib/followups";
import { FollowupForm } from "./FollowupForm";

interface FollowupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  /** Dono do negócio: responsável padrão. */
  ownerId: string | null;
  title?: string | null;
}

export function FollowupDialog({ open, onOpenChange, opportunityId, ownerId, title }: FollowupDialogProps) {
  const line = useOutreachLine();
  const schedule = useScheduleFollowup();
  const [value, setValue] = useState<FollowupFormValue>(() => initialFollowupValue(ownerId));

  useEffect(() => {
    if (open) setValue(initialFollowupValue(ownerId));
  }, [open, ownerId]);

  const submit = () => {
    const problem = validateFollowupForm(value, "manual", line.hasLine);
    if (problem) {
      toast.error(problem);
      return;
    }
    schedule.mutate(
      {
        opportunityId,
        dueAt: dueAtFromLocal(value.date, value.time),
        kind: "manual",
        ownerId: value.ownerId,
        notifyOwner: value.notifyOwner,
        sendMessage: value.sendMessage,
        messageText: value.messageText,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar follow-up</DialogTitle>
          <DialogDescription>
            {title ? `Negócio: ${title}` : "Escolha quando voltar a falar com o cliente."}
          </DialogDescription>
        </DialogHeader>
        <FollowupForm
          value={value}
          onChange={setValue}
          mode="manual"
          hasLine={line.hasLine}
          lineLabel={line.label}
          disabled={schedule.isPending}
        />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={schedule.isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={schedule.isPending}>
            {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
