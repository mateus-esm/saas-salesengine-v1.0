import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VelocityScoreBadgeProps {
  velocity: number | null; // null = not calculated yet / loading
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opacity ramp: >= 80 → full, >= 50 → 70%, else → 40%.
 * null → 30% (loading placeholder).
 */
function opacityForVelocity(velocity: number | null): string {
  if (velocity === null) return "opacity-30";
  if (velocity >= 80) return "opacity-100";
  if (velocity >= 50) return "opacity-70";
  return "opacity-40";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VelocityScoreBadge({ velocity }: VelocityScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-mono",
        "border border-border/60 rounded px-1 py-0.5 bg-card/80",
        opacityForVelocity(velocity),
      )}
    >
      <span>&#x1F525;</span>
      <span>{velocity !== null ? `${Math.round(velocity)}` : "--"}</span>
    </span>
  );
}
