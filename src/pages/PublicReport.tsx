/**
 * Sprint 9 — the full report behind the WhatsApp link.
 *
 * Public, no login: the person opening it is holding a phone and just tapped a
 * message. That shapes everything here — it reads top to bottom on a narrow
 * screen, it renders the FROZEN snapshot rather than querying live data, and it
 * never asks for credentials.
 *
 * "Frozen" is the important part. The link has to keep showing the numbers that
 * were in that message, forever. A page that recomputed would show different
 * figures a week later and make a correct report look wrong.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

interface ReportData {
  name: string;
  frequency: string;
  timezone: string;
  period_start: string;
  period_end: string;
  created_at: string;
  snapshot: {
    equipe_name?: string;
    sections?: string[];
    overview?: Record<string, number | null>;
    loss_reasons?: { reason: string; count: number; value: number }[];
    top_opportunities?: {
      lead_name: string;
      value: number;
      days_in_stage: number;
      responsible_name?: string | null;
      stage_name?: string | null;
    }[];
  };
}

const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    .format(Number(v) || 0);

const int = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR").format(Number(v) || 0);

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`;

export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ok" | "expired" | "error">("loading");
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("report-snapshot", {
          body: { token },
        });
        if (cancelled) return;

        // invoke() surfaces a non-2xx as an error, so the expiry case has to be
        // recognised from the payload rather than from the status alone.
        const payload = data as { report?: ReportData; error?: string } | null;
        if (payload?.report) {
          setReport(payload.report);
          setState("ok");
        } else if (payload?.error === "expired" || String(error?.message ?? "").includes("410")) {
          setState("expired");
        } else {
          setState("error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (state !== "ok" || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          {state === "expired" ? (
            <>
              <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h1 className="text-base font-semibold text-foreground">Este relatório expirou</h1>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Links de relatório valem 90 dias. Abra o dashboard para ver os números atuais.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h1 className="text-base font-semibold text-foreground">Relatório não encontrado</h1>
              <p className="mt-1.5 text-xs text-muted-foreground">
                O link pode estar incompleto. Confira a mensagem original.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const o = report.snapshot.overview ?? {};
  const sections = new Set(report.snapshot.sections ?? []);
  const has = (id: string) => sections.has(id);

  // The window is half-open, so the last day it covers is the day before
  // period_end. Printing period_end would claim a day the numbers exclude.
  const lastDay = new Date(new Date(report.period_end).getTime() - 1);
  const periodLabel =
    report.frequency === "daily"
      ? format(parseISO(report.period_start), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
      : `${format(parseISO(report.period_start), "dd/MM", { locale: ptBR })} a ${format(lastDay, "dd/MM/yyyy", { locale: ptBR })}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {report.snapshot.equipe_name ?? "Relatório comercial"}
            </div>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-foreground">
              {report.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
          </div>
          <Logo className="h-7 w-auto shrink-0 opacity-80" />
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {has("kpi_won_value") && (
            <Stat label="Receita ganha" value={brl(o.won_value)} hint={`${int(o.deals_won)} negócios`} emphasis />
          )}
          {has("kpi_open_value") && (
            <Stat label="Pipeline aberto" value={brl(o.open_value)} hint={`${int(o.open_count)} em aberto`} emphasis />
          )}
          {has("kpi_new_leads") && <Stat label="Novos leads" value={int(o.new_leads)} />}
          {has("kpi_proposals") && <Stat label="Propostas" value={int(o.proposals_sent)} />}
          {has("kpi_meetings") && (
            <Stat label="Reuniões" value={int(o.meetings_done)} hint={`${pct(o.show_rate)} presença`} />
          )}
          {has("kpi_no_show") && <Stat label="No-show" value={int(o.no_shows)} hint={pct(o.no_show_rate)} />}
          {has("kpi_win_rate") && <Stat label="Taxa de ganho" value={pct(o.win_rate)} />}
          {has("kpi_avg_ticket") && <Stat label="Ticket médio" value={o.avg_ticket != null ? brl(o.avg_ticket) : "—"} />}
          {has("kpi_cycle") && (
            <Stat label="Ciclo de venda" value={o.avg_cycle_days != null ? `${o.avg_cycle_days} d` : "—"} />
          )}
          {has("kpi_touchpoints") && <Stat label="Interações" value={int(o.touchpoints)} />}
        </section>

        {has("panel_loss_reasons") && !!report.snapshot.loss_reasons?.length && (
          <Card className="mt-4 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Por que perdemos ({int(o.deals_lost)})
            </h2>
            <div className="space-y-2">
              {report.snapshot.loss_reasons.map((r) => (
                <div key={r.reason} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{r.reason}</span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {int(r.count)} · {brl(r.value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {has("panel_top_opportunities") && !!report.snapshot.top_opportunities?.length && (
          <Card className="mt-4 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Melhores oportunidades abertas
            </h2>
            <div className="space-y-2.5">
              {report.snapshot.top_opportunities.map((t, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{t.lead_name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {t.stage_name ?? "—"}
                      {t.responsible_name ? ` · ${t.responsible_name}` : ""}
                      {t.days_in_stage >= 14 ? ` · parada há ${t.days_in_stage} dias` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {brl(t.value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <footer className="mt-6 border-t border-border pt-4 text-center">
          <p className="text-[11px] text-muted-foreground">
            Gerado em {format(parseISO(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
            Este relatório mostra os números do período fechado e não muda depois de enviado.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={`p-3 ${emphasis ? "border-primary/30 bg-primary/[0.03]" : ""}`}>
      <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 truncate font-bold tabular-nums text-foreground ${emphasis ? "text-xl" : "text-lg"}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}
