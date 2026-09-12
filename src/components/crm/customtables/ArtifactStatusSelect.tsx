import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ARTIFACT_STATUS_LABEL,
  ARTIFACT_STATUS_STYLE,
  artifactMilestone,
  artifactStatusesFor,
  artifactStatusOf,
  milestoneLabel,
  type ArtifactKind,
  type ArtifactStatus,
} from "@/lib/artifacts";
import { cn } from "@/lib/utils";

interface ArtifactStatusSelectProps {
  kind: ArtifactKind;
  value: unknown;
  onChange: (next: ArtifactStatus) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Sprint 11 · Onda 4 · T43 — the artifact's status, as a pill that opens the
 * kind's statuses. The ones that prove a milestone of the deal say so.
 */
export function ArtifactStatusSelect({ kind, value, onChange, disabled = false, className }: ArtifactStatusSelectProps) {
  const current = artifactStatusOf(value);
  return (
    <Select value={current} onValueChange={(v) => v !== current && onChange(v as ArtifactStatus)} disabled={disabled}>
      <SelectTrigger
        className={cn("h-7 w-auto gap-1 rounded-full border-0 px-2.5 text-[11px] font-medium", ARTIFACT_STATUS_STYLE[current], className)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Status"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {artifactStatusesFor(kind).map((s) => {
          const milestone = milestoneLabel(artifactMilestone(kind, s));
          return (
            <SelectItem key={s} value={s}>
              {ARTIFACT_STATUS_LABEL[s]}
              {milestone && <span className="ml-1 text-muted-foreground">· marca “{milestone}”</span>}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
