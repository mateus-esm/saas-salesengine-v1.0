import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LeadScoreBreakdown {
  icp?: number | null;
  velocity?: number | null;
  touchpoints?: number;
  daysSinceLastContact?: number;
  [key: string]: unknown;
}

export interface LeadScoreBadgeProps {
  score: number | null | undefined; // 0-10, null/undefined = no score yet
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;              // show "Lead Score" label below the number
  className?: string;
  breakdown?: LeadScoreBreakdown;    // optional breakdown shown in tooltip
}

// ---------------------------------------------------------------------------
// Color & classification helpers
// ---------------------------------------------------------------------------

type ScoreBand = "cold" | "warm" | "hot" | "on-fire";

const SCORE_CONFIG: Record<ScoreBand, { label: string; bg: string; text: string }> = {
  cold:    { label: "Frio",     bg: "bg-muted/50",        text: "text-muted-foreground" },
  warm:    { label: "Morno",    bg: "bg-amber-400/15",    text: "text-amber-600 dark:text-amber-400" },
  hot:     { label: "Quente",   bg: "bg-sky-400/15",      text: "text-sky-600 dark:text-sky-400" },
  "on-fire": { label: "Quente!", bg: "bg-emerald-400/15", text: "text-emerald-600 dark:text-emerald-400" },
};

function classifyScore(score: number): ScoreBand {
  if (score >= 9) return "on-fire";
  if (score >= 7) return "hot";
  if (score >= 4) return "warm";
  return "cold";
}

// ---------------------------------------------------------------------------
// Size maps
// ---------------------------------------------------------------------------

const SIZE_DIMENSIONS: Record<NonNullable<LeadScoreBadgeProps["size"]>, { circle: string; font: string }> = {
  sm: { circle: "w-4 h-4", font: "text-[9px]" },
  md: { circle: "w-6 h-6", font: "text-[11px]" },
  lg: { circle: "w-8 h-8", font: "text-sm" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeadScoreBadge({
  score,
  size = "sm",
  showLabel = false,
  className,
  breakdown,
}: LeadScoreBadgeProps) {
  const dim = SIZE_DIMENSIONS[size];
  const hasScore = score !== null && score !== undefined;
  const band = hasScore ? classifyScore(score) : null;
  const cfg = band ? SCORE_CONFIG[band] : null;

  // — Tooltip content -------------------------------------------------------
  const tooltipLines: string[] = [];
  if (hasScore && band && cfg) {
    tooltipLines.push(`Lead Score: ${score}/10 — ${cfg.label}`);
  } else {
    tooltipLines.push("Lead Score: —");
  }
  if (breakdown) {
    if (breakdown.icp !== null && breakdown.icp !== undefined) {
      tooltipLines.push(`ICP: ${Math.round(breakdown.icp)}%`);
    }
    if (breakdown.velocity !== null && breakdown.velocity !== undefined) {
      tooltipLines.push(`Velocidade: ${Math.round(breakdown.velocity)}`);
    }
    if (breakdown.touchpoints !== undefined) {
      tooltipLines.push(`Interações: ${breakdown.touchpoints}`);
    }
    if (breakdown.daysSinceLastContact !== undefined) {
      tooltipLines.push(`Último contato: ${breakdown.daysSinceLastContact}d`);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex flex-col items-center gap-0.5",
            !hasScore && "opacity-40",
            className,
          )}
        >
          {/* Circular badge */}
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              "font-mono font-semibold leading-none",
              dim.circle,
              dim.font,
              hasScore && cfg?.bg,
              hasScore ? cfg?.text : "text-muted-foreground",
              !hasScore && "bg-muted/30",
            )}
          >
            {hasScore ? score : "—"}
          </span>

          {/* Optional label */}
          {showLabel && (
            <span className="text-[9px] text-muted-foreground leading-none whitespace-nowrap">
              Lead Score
            </span>
          )}
        </span>
      </TooltipTrigger>

      <TooltipContent side="top" className="text-xs space-y-0.5">
        {tooltipLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
