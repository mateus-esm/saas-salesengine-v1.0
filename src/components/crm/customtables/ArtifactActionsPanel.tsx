import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useArtifactRuns, useRunArtifactAction } from "@/hooks/useArtifactActions";
import { isRunWaiting, runStatusText, type ArtifactAction } from "@/lib/artifactActions";
import { cn } from "@/lib/utils";

interface ArtifactActionsPanelProps {
  recordId: string;
  tableId: string;
  actions: ArtifactAction[];
}

const ago = (iso: string) => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
};

/**
 * Sprint 11 · Onda 4 · T44 — in the record's drawer: the table's automation
 * buttons and what happened to the last clicks (waiting, done, failed). When the
 * automation answers, the record is read again.
 */
export function ArtifactActionsPanel({ recordId, tableId, actions }: ArtifactActionsPanelProps) {
  const run = useRunArtifactAction();
  const runs = useArtifactRuns(recordId, tableId, actions.length > 0);

  if (actions.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Automações</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => run.mutate({ recordId, actionId: a.id, label: a.label })}
            disabled={run.isPending}
          >
            {run.isPending && run.variables?.actionId === a.id ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="mr-1.5 h-3.5 w-3.5" />
            )}
            {a.label}
          </Button>
        ))}
      </div>
      {(runs.data ?? []).length > 0 && (
        <ul className="space-y-1">
          {(runs.data ?? []).map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate">
                <span className="font-medium">{r.action_label}</span>
                <span className={cn("ml-1.5", isRunWaiting(r) ? "text-sky-700 dark:text-sky-300" : r.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  {runStatusText(r)}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">{ago(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
