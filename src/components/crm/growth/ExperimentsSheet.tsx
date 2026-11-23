import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCreatives, useExperiments } from "@/hooks/useGrowth";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { parseBrNumber } from "@/lib/fields/registry";
import {
  clampIce,
  emptyExperiment,
  EXPERIMENT_DECISIONS,
  EXPERIMENT_METRICS,
  EXPERIMENT_STATUSES,
  experimentHit,
  experimentToDraft,
  experimentValue,
  iceScore,
  metricInfo,
  type Experiment,
  type ExperimentDraft,
} from "@/lib/growth";
import { overlaps, type GrowthRange } from "@/lib/growthPeriod";
import { cn } from "@/lib/utils";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v).replace(/\s/g, " ");
const fmt = (v: number | null, money?: boolean) =>
  v === null ? "—" : money ? brl(v) : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);

const CELL = "h-8 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-sm outline-none hover:border-border focus:border-primary focus:bg-background";
const STATUS_TONE: Record<string, string> = {
  idea: "bg-muted text-muted-foreground",
  planned: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  discarded: "bg-muted text-muted-foreground line-through",
};

type Filter = "open" | "done" | "all";

/**
 * Sprint 16 — the growth sheet: one row per experiment, edited in place. A select
 * saves on change, a text on blur. Linked to a campaign (and/or creative), the
 * result comes live from Rev in the experiment's window; otherwise it is typed.
 */
export function ExperimentsSheet({ range }: { range: GrowthRange }) {
  const { experiments, isLoading, save, remove } = useExperiments();
  const { campaigns } = useCampaigns();
  const { creatives } = useCreatives();
  const { members } = useMemberDirectory();
  const [filter, setFilter] = useState<Filter>("open");

  const rows = useMemo(
    () =>
      experiments
        .filter((e) => overlaps(e.starts_on, e.ends_on, range))
        .filter((e) =>
          filter === "all" ? true : filter === "done" ? e.status === "done" || e.status === "discarded" : e.status !== "done" && e.status !== "discarded",
        ),
    [experiments, filter, range],
  );

  const stats = useMemo(() => {
    const done = experiments.filter((e) => e.status === "done");
    const hits = done.filter((e) => experimentHit(e) === true).length;
    return {
      running: experiments.filter((e) => e.status === "running").length,
      queued: experiments.filter((e) => e.status === "idea" || e.status === "planned").length,
      done: done.length,
      hitRate: done.length ? Math.round((100 * hits) / done.length) : null,
    };
  }, [experiments]);

  const add = () => save.mutate({ ...emptyExperiment(), title: "Novo experimento" });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(["open", "done", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn("rounded px-2.5 py-1", filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {f === "open" ? "Em aberto" : f === "done" ? "Concluídos" : "Todos"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {stats.running} rodando · {stats.queued} na fila · {stats.done} concluído(s)
          {stats.hitRate !== null ? ` · ${stats.hitRate}% bateram a meta` : ""}
        </p>
        <Button size="sm" className="ml-auto" onClick={add} disabled={save.isPending}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova linha
        </Button>
      </div>

      {experiments.length === 0 ? (
        <div className="mx-auto max-w-md py-12 text-center">
          <FlaskConical className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">Nenhum experimento ainda</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Uma linha por teste: a hipótese, o canal, a campanha que mede, a meta e o que aprendeu. Priorize pelo ICE
            (impacto × confiança × facilidade).
          </p>
          <Button size="sm" className="mt-4" onClick={add}>
            <Plus className="mr-1.5 h-4 w-4" /> Primeiro experimento
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
                <th>Status</th>
                <th className="min-w-[200px]">Experimento</th>
                <th className="min-w-[240px]">Hipótese</th>
                <th>Canal</th>
                <th>Campanha</th>
                <th>Criativo</th>
                <th title="Impacto · Confiança · Facilidade (1–10)">ICE</th>
                <th>Métrica</th>
                <th className="text-right">Base</th>
                <th className="text-right">Meta</th>
                <th className="text-right">Resultado</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Decisão</th>
                <th className="min-w-[220px]">Aprendizado</th>
                <th>Resp.</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => (
                <ExperimentRow
                  key={e.id}
                  experiment={e}
                  campaigns={campaigns.filter((c) => c.status !== "archived" || c.id === e.campaign_id)}
                  creatives={creatives.filter((c) => c.status !== "archived" || c.id === e.creative_id)}
                  members={members}
                  onSave={(d) => save.mutate(d)}
                  onDelete={() => remove.mutate(e.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExperimentRow({
  experiment,
  campaigns,
  creatives,
  members,
  onSave,
  onDelete,
}: {
  experiment: Experiment;
  campaigns: { id: string; name: string }[];
  creatives: { id: string; code: string; title: string }[];
  members: { id: string; name: string }[];
  onSave: (d: ExperimentDraft) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState<ExperimentDraft>(() => experimentToDraft(experiment));
  useEffect(() => setD(experimentToDraft(experiment)), [experiment]);

  // Change + save at once (selects), or only change (texts; saved on blur).
  const set = <K extends keyof ExperimentDraft>(k: K, v: ExperimentDraft[K], commit = false) => {
    const next = { ...d, [k]: v };
    setD(next);
    if (commit) onSave(next);
  };
  const commit = () => {
    const before = JSON.stringify(experimentToDraft(experiment));
    if (JSON.stringify(d) !== before) onSave(d);
  };

  const info = metricInfo(d.metric);
  const value = experimentValue({ ...d, live: experiment.live });
  const hit = experimentHit({ ...d, live: experiment.live });
  const score = iceScore(d);
  const manual = d.metric === "custom" || !experiment.live;

  const numCell = (k: "baseline" | "target" | "result_value") => (
    <NumCell value={d[k]} onCommit={(v) => set(k, v, true)} />
  );
  const iceCell = (k: "ice_impact" | "ice_confidence" | "ice_ease", label: string) => (
    <input
      aria-label={label}
      title={label}
      className={cn(CELL, "w-8 px-0 text-center tabular-nums")}
      inputMode="numeric"
      value={d[k] ?? ""}
      onChange={(ev) => set(k, ev.target.value ? clampIce(Number(ev.target.value)) : null)}
      onBlur={commit}
      placeholder="·"
    />
  );

  return (
    <tr className="align-middle hover:bg-muted/30 [&>td]:px-1 [&>td]:py-0.5">
      <td>
        <select
          aria-label="Status"
          className={cn("h-7 rounded-full border-0 px-2 text-xs font-medium outline-none", STATUS_TONE[d.status])}
          value={d.status}
          onChange={(ev) => set("status", ev.target.value as ExperimentDraft["status"], true)}
        >
          {EXPERIMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </td>
      <td>
        <input aria-label="Experimento" className={cn(CELL, "font-medium")} value={d.title} onChange={(ev) => set("title", ev.target.value)} onBlur={commit} />
      </td>
      <td>
        <input
          aria-label="Hipótese"
          className={CELL}
          value={d.hypothesis ?? ""}
          title={d.hypothesis ?? ""}
          placeholder="Se… então… porque…"
          onChange={(ev) => set("hypothesis", ev.target.value || null)}
          onBlur={commit}
        />
      </td>
      <td>
        <select aria-label="Canal" className={cn(CELL, "w-36")} value={d.channel ?? ""} onChange={(ev) => set("channel", (ev.target.value || null) as ExperimentDraft["channel"], true)}>
          <option value="">—</option>
          {ORIGIN_CATEGORY_OPTIONS.filter((o) => o.value !== "api_import").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td>
        <select aria-label="Campanha" className={cn(CELL, "w-44")} value={d.campaign_id ?? ""} onChange={(ev) => set("campaign_id", ev.target.value || null, true)}>
          <option value="">—</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td>
        <select aria-label="Criativo" className={cn(CELL, "w-32")} value={d.creative_id ?? ""} onChange={(ev) => set("creative_id", ev.target.value || null, true)}>
          <option value="">—</option>
          {creatives.map((c) => <option key={c.id} value={c.id}>{c.code}{c.title ? ` · ${c.title}` : ""}</option>)}
        </select>
      </td>
      <td>
        <div className="flex items-center gap-0.5">
          {iceCell("ice_impact", "Impacto")}
          {iceCell("ice_confidence", "Confiança")}
          {iceCell("ice_ease", "Facilidade")}
          <span className="ml-1 w-9 text-right text-xs font-semibold tabular-nums text-muted-foreground">{score ?? ""}</span>
        </div>
      </td>
      <td>
        <select aria-label="Métrica" className={cn(CELL, "w-36")} value={d.metric} onChange={(ev) => set("metric", ev.target.value as ExperimentDraft["metric"], true)}>
          {EXPERIMENT_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </td>
      <td>{numCell("baseline")}</td>
      <td>{numCell("target")}</td>
      <td className="text-right">
        {manual ? (
          numCell("result_value")
        ) : (
          <span
            title={experiment.live ? `Ao vivo: ${experiment.live.leads} leads · ${experiment.live.wins} ganhos · gasto ${brl(experiment.live.spend)}` : ""}
            className={cn(
              "inline-block rounded px-1.5 py-0.5 text-sm font-semibold tabular-nums",
              hit === true && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
              hit === false && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
            )}
          >
            {fmt(value, info.money)}
          </span>
        )}
      </td>
      <td>
        <input type="date" aria-label="Início" className={cn(CELL, "w-[8.5rem]")} value={d.starts_on ?? ""} onChange={(ev) => set("starts_on", ev.target.value || null, true)} />
      </td>
      <td>
        <input type="date" aria-label="Fim" className={cn(CELL, "w-[8.5rem]")} value={d.ends_on ?? ""} onChange={(ev) => set("ends_on", ev.target.value || null, true)} />
      </td>
      <td>
        <select aria-label="Decisão" className={cn(CELL, "w-24")} value={d.decision ?? ""} onChange={(ev) => set("decision", (ev.target.value || null) as ExperimentDraft["decision"], true)}>
          <option value="">—</option>
          {EXPERIMENT_DECISIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </td>
      <td>
        <input
          aria-label="Aprendizado"
          className={CELL}
          value={d.learnings ?? ""}
          title={d.learnings ?? ""}
          placeholder="O que ficou?"
          onChange={(ev) => set("learnings", ev.target.value || null)}
          onBlur={commit}
        />
      </td>
      <td>
        <select aria-label="Responsável" className={cn(CELL, "w-32")} value={d.owner_id ?? ""} onChange={(ev) => set("owner_id", ev.target.value || null, true)}>
          <option value="">—</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </td>
      <td>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label="Apagar experimento"
          onClick={() => {
            if (window.confirm(`Apagar “${d.title || "experimento"}”?`)) onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

/** A number typed the Brazilian way ("1.234,5"); its own text while typing, saved on blur. */
function NumCell({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const show = (v: number | null) => (v === null ? "" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  return (
    <input
      className={cn(CELL, "w-20 text-right tabular-nums")}
      inputMode="decimal"
      value={text}
      placeholder="—"
      onChange={(ev) => setText(ev.target.value)}
      onBlur={() => {
        const v = parseBrNumber(text);
        if (v !== value) onCommit(v);
        else setText(show(value));
      }}
    />
  );
}
