/**
 * Sprint 9 — asking why, at the one moment the answer is known.
 *
 * The Vision asks for "deals lost, motive". The motive is only worth having if
 * it is captured when the deal is lost — asking later means asking someone to
 * remember, and what comes back is "não sei" or nothing.
 *
 * So this opens on the drop into a lost stage, and it is deliberately NOT
 * blocking: the deal moves either way. A dialog that refuses to let a seller
 * close a lost deal without filling a form is a dialog that teaches them to
 * leave dead deals sitting in "Negociação" forever, and then the pipeline
 * number — the one on the dashboard — becomes fiction. Better a loss with no
 * reason than a loss that never gets recorded.
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

export interface LossReasonOption {
  label: string;
  color?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pipeline's configured reasons. Empty = free text only. */
  reasons: LossReasonOption[];
  leadName?: string;
  /** Called with the chosen reason, or null when the user skips. */
  onConfirm: (reason: string | null) => void;
}

export function LossReasonDialog({
  open,
  onOpenChange,
  reasons,
  leadName,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">Por que este negócio foi perdido?</DialogTitle>
          <DialogDescription className="text-xs">
            {leadName ? (
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
          {/* Skipping is a first-class option, not a hidden escape hatch. */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              onConfirm(null);
              onOpenChange(false);
            }}
          >
            Pular
          </Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={!finalReason}
            onClick={() => {
              onConfirm(finalReason);
              onOpenChange(false);
            }}
          >
            Salvar motivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
