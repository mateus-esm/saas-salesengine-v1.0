import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ICPScoreBadgeProps {
  score: number | null; // null = not calculated yet / loading
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opacity ramp: >= 80 → full, >= 50 → 70%, else → 40%.
 * null → 30% (loading placeholder).
 */
function opacityForScore(score: number | null): string {
  if (score === null) return "opacity-30";
  if (score >= 80) return "opacity-100";
  if (score >= 50) return "opacity-70";
  return "opacity-40";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICPScoreBadge({ score }: ICPScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-mono",
        "border border-border/60 rounded px-1 py-0.5 bg-card/80",
        opacityForScore(score),
      )}
    >
      <span>&#x1F3AF;</span>
      <span>{score !== null ? `${score}%` : "--"}</span>
    </span>
  );
}
