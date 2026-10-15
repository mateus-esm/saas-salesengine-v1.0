/**
 * Sprint 9 — asking why, at the one moment the answer is known.
 *
 * The Vision asks for "deals lost, motive". The motive is only worth having if
 * it is captured when the deal is lost — asking later means asking someone to
 * remember, and what comes back is "não sei" or nothing.
 *
 * Sprint Suporte 1 · #12 — it used to be skippable ("Pular") and only opened on
 * the Kanban drag, so 528 of 533 lost deals of one client had no reason. It is
 * now mandatory and opens from every move path (useMoveToStage): there is no
 * skip, and closing it (Cancelar, Esc, click outside) CANCELS the move — the deal
 * stays where it was, so a loss is never recorded without its reason.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { LossReasonOption } from "@/lib/board";

export type { LossReasonOption };

interface Props {
  open: boolean;
  /** Fired when the dialog is dismissed without a reason: the move is cancelled. */
  onCancel: () => void;
  /** The pipeline's configured reasons, plus "Outro…" free text. */
  reasons: LossReasonOption[];
  leadName?: string;
  /** Bulk move: how many deals share this one reason. */
  count?: number;
  /** Called with the chosen, non-empty reason. */
  onConfirm: (reason: string) => void;
}

export function LossReasonDialog({
  open,
  onCancel,
  reasons,
  leadName,
  count,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(null);
      setOther("");
    }
  }, [open]);

  const finalReason = selected === "__other__" ? other.trim() || null : selected;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">Por que este negócio foi perdido?</DialogTitle>
          <DialogDescription className="text-xs">
            {count && count > 1 ? (
              <>
                {count} negócios serão movidos para uma etapa de perda. O motivo escolhido
                aplica-se aos {count} negócios.
              </>
            ) : leadName ? (
              <>
                <span className="font-medium text-foreground">{leadName}</span> foi movido para
                uma etapa de perda. O motivo alimenta o dashboard e o relatório.
              </>
            ) : (
              "O motivo alimenta o dashboard e o relatório."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 py-1">
          {reasons.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setSelected(r.label)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                selected === r.label
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {r.color && (
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: r.color }}
                />
              )}
              {r.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSelected("__other__")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              selected === "__other__"
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            Outro…
          </button>
        </div>

        {selected === "__other__" && (
          <Input
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Descreva o motivo"
            className="h-9 text-xs"
            maxLength={80}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {/* No "skip": cancelling leaves the deal in its stage. */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={!finalReason}
            onClick={() => {
              if (finalReason) onConfirm(finalReason);
            }}
          >
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
