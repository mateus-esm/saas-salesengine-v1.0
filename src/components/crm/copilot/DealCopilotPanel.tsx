import { Check, Loader2, Undo2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCopilotDeal } from "@/hooks/useCopilotDeal";
import { useCopilotDecisionActions } from "@/hooks/useCopilotFeed";
import { statusLabel, whyLabel } from "@/lib/copilotFeed";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

const UNDOABLE = new Set(["auto_applied", "executed"]);

/**
 * Sprint 11 · Onda 6 · T65 — the Copilot on this deal: the summary it keeps (so
 * nobody has to reread the whole conversation), the suggestions waiting for a
 * person, and what it did, with undo.
 */
export function DealCopilotPanel({ opportunityId, enabled }: { opportunityId: string; enabled: boolean }) {
  const { data, isLoading, isError } = useCopilotDeal(opportunityId, enabled);
  const { resolve, undo } = useCopilotDecisionActions();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading) return <p className="py-2 text-xs text-muted-foreground">Carregando…</p>;
  if (isError || !data) return <p className="py-2 text-xs italic text-muted-foreground">Não consegui ler o Copilot deste negócio.</p>;

  const job = data.last_job;
  return (
    <div className="space-y-3 py-1 text-xs">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resumo</p>
        {data.summary ? (
          <>
            <p className="mt-0.5 whitespace-pre-line text-sm text-foreground/90">{data.summary}</p>
            {data.summary_at && <p className="mt-0.5 text-muted-foreground">atualizado {when(data.summary_at)}</p>}
          </>
        ) : (
          <p className="mt-0.5 italic text-muted-foreground">O Copilot ainda não leu a conversa deste negócio.</p>
        )}
        {job && (
          <p className="mt-1 text-muted-foreground">
            Última leitura: {job.status === "done"
              ? `${job.result?.applied ?? 0} ações, ${job.result?.pending ?? 0} para aprovar`
              : job.status === "failed"
                ? `falhou${job.last_error ? ` — ${job.last_error}` : ""}`
                : job.status === "skipped"
                  ? "nada novo"
                  : "na fila"}
          </p>
        )}
      </div>

      {data.pending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Esperando você</p>
          {data.pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{p.label ?? "Sugestão"}</p>
                {p.why && <p className="text-muted-foreground">{whyLabel(p.why)}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Aprovar"
                  disabled={busyId === p.id}
                  onClick={() => {
                    setBusyId(p.id);
                    resolve.mutate({ id: p.id, approve: true }, { onSettled: () => setBusyId(null) });
                  }}
                >
                  {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Recusar"
                  disabled={busyId === p.id}
                  onClick={() => {
                    setBusyId(p.id);
                    resolve.mutate({ id: p.id, approve: false }, { onSettled: () => setBusyId(null) });
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que o Copilot fez</p>
          {data.recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-foreground/90">
                {r.label ?? "Ação"} <span className="text-muted-foreground">· {statusLabel(r.status)} · {when(r.at)}</span>
              </p>
              {UNDOABLE.has(r.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-1.5 text-[11px]"
                  disabled={busyId === r.id}
                  onClick={() => {
                    setBusyId(r.id);
                    undo.mutate(r.id, { onSettled: () => setBusyId(null) });
                  }}
                >
                  <Undo2 className="mr-1 h-3 w-3" />
                  Desfazer
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
