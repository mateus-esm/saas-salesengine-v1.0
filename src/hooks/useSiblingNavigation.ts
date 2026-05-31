import { useMemo } from "react";
import type { Opportunity } from "@/types/pipelines";

/**
 * Sprint 5.1 §5.2 — Paddle shifters. The parent (Kanban / Table) supplies the
 * ordered sibling list (already filtered/sorted the way the user sees it).
 * The hook returns prev/next ids so the modal can swap without remounting.
 */
export const useSiblingNavigation = (
  siblings: Opportunity[],
  currentId: string | null,
) => {
  const idx = useMemo(
    () => siblings.findIndex((o) => o.id === currentId),
    [siblings, currentId],
  );
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;
  const canPrev = !!prevId;
  const canNext = !!nextId;
  const indexLabel = idx >= 0 ? `${idx + 1} / ${siblings.length}` : "";
  return { prevId, nextId, canPrev, canNext, indexLabel };
};
