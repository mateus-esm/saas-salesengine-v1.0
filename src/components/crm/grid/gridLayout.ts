// Sprint 15 · T7 — the grid's fixed layout: column widths and sticky offsets.

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export const CHECKBOX_W = 40;
export const PRIMARY_W = 260;
export const DEFAULT_W = 180;
export const SCORE_W = 64;
/** The "add column" and "columns" menu cells. */
export const ACTION_W = 40;

export const LEAD_SCORE_COL_KEY = "_lead_score";

/** Where a sticky cell sits: its left offset and whether it is the last one. */
export interface StickySlot {
  left: number;
  last: boolean;
}

/**
 * The left offset of a sticky cell. The inline `left` is the one that counts:
 * the offsets depend on which columns are on (score) and on their widths. The
 * `left-0` / `left-10` classes only name the plain case (checkbox at 0, primary
 * at 40) so it can be read and asserted as a class; they always agree with the
 * inline value.
 */
export function stickyLeft(slot: StickySlot): { className: string; style: CSSProperties } {
  return {
    className: cn(
      "sticky",
      slot.left === 0 && "left-0",
      slot.left === 40 && "left-10",
      slot.last && "shadow-[1px_0_0_hsl(var(--border))]",
    ),
    style: { left: slot.left },
  };
}
