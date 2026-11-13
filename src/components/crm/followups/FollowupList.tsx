// Sprint 15b · T3 — os follow-ups de um negócio: agendados (com cancelar) e o
// que aconteceu com os já executados.

import { CalendarClock, MessageCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCancelFollowup, useFollowups } from "@/hooks/useFollowups";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import {
  FOLLOWUP_TZ,
  followupMessageResultLabel,
  followupReturnResultLabel,
  followupStatusLabel,
  type Followup,
} from "@/lib/followups";
import { cn } from "@/lib/utils";

const formatDue = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: FOLLOWUP_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(",", "");

const STATUS_STYLE: Record<Followup["status"], string> = {
  scheduled: "border-primary/30 bg-primary/10 text-foreground",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function FollowupList({
  opportunityId,
  stageName,
}: {
  opportunityId: string;
  stageName?: (id: string) => string | null;
}) {
  const { data, isLoading, isError, refetch } = useFollowups(opportunityId);
  const cancel = useCancelFollowup();
  const { nameOf } = useMemberDirectory();

  if (isLoading) {
    return (
      <div className="space-y-2" aria-label="Carregando follow-ups" role="status">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <span>Não foi possível carregar os follow-ups.</span>
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return <p className="py-2 text-xs italic text-muted-foreground">Nenhum follow-up agendado.</p>;
  }

  // Agendados primeiro (o mais próximo no topo); depois o histórico, do mais recente.
  const scheduled = rows.filter((f) => f.status === "scheduled").sort((a, b) => a.due_at.localeCompare(b.due_at));
  const past = rows.filter((f) => f.status !== "scheduled").sort((a, b) => b.due_at.localeCompare(a.due_at));

  return (
    <ul className="space-y-2">
      {[...scheduled, ...past].map((f) => {
        const messageResult = followupMessageResultLabel(f);
        const returnResult = followupReturnResultLabel(f);
        const returnStage = f.return_stage_id ? stageName?.(f.return_stage_id) ?? null : null;
        const owner = nameOf(f.owner_id);
        return (
          <li key={f.id} className="space-y-1 rounded-md border border-border bg-card px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 font-medium tabular-nums">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {formatDue(f.due_at)}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={cn("rounded border px-1.5 py-0.5 font-medium", STATUS_STYLE[f.status])}>
                  {followupStatusLabel(f.status)}
                </span>
                {f.status === "scheduled" && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label="Cancelar follow-up"
                    title="Cancelar follow-up"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(f.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </span>
            </div>
            {(f.reason || owner) && (
              <p className="truncate text-muted-foreground">
                {[f.reason, owner ? `Responsável: ${owner}` : null].filter(Boolean).join(" · ")}
              </p>
            )}
            {f.send_message && (
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <MessageCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2">{f.message_text}</span>
              </p>
            )}
            {f.status === "scheduled" && returnStage && (
              <p className="text-muted-foreground">Volta para: {returnStage}</p>
            )}
            {f.status === "done" && f.result?.notified === true && (
              <p className="text-muted-foreground">Responsável avisado</p>
            )}
            {f.status !== "scheduled" &&
              [f.result?.error, f.result?.message_error, f.result?.return_error].filter(Boolean).map((t, i) => (
                <p key={i} className="text-muted-foreground">{t}</p>
              ))}
            {f.status !== "scheduled" && (messageResult || returnResult || f.status === "failed") && (
              <p className="text-muted-foreground">
                {[messageResult, returnResult, f.status === "failed" ? "Não foi possível executar" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
