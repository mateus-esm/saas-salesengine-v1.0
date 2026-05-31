import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface PaddleShifterNavProps {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  label?: string;
}

/**
 * Sprint 5.1 §5.2 — `<` / `>` paddle shifters for the opportunity drawer.
 * Arrow keys mirror the buttons, except while a text field is focused so the
 * seller can still edit inputs without the card sliding underneath them.
 */
export const PaddleShifterNav = ({ canPrev, canNext, onPrev, onNext, label }: PaddleShifterNavProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && canPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && canNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canPrev, canNext, onPrev, onNext]);

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canPrev} onClick={onPrev} title="Anterior (←)">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {label && <span className="text-[11px] text-muted-foreground tabular-nums px-1">{label}</span>}
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canNext} onClick={onNext} title="Próximo (→)">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
