import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { originLabel } from "@/config/originTaxonomy";
import { useCampaignReport, useCampaigns } from "@/hooks/useCampaigns";
import { platformLabel } from "@/lib/attribution";
import {
  REPORT_PERIOD_LABELS,
  reportRange,
  reportTotals,
  type CampaignReportRow,
  type ReportPeriod,
} from "@/lib/campaigns";
import { cn } from "@/lib/utils";

const brl = (v: number | null) =>
  v === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v).replace(/\u00a0/g, " ");
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);
const times = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`);

/**
 * Sprint 11 · Onda 5 · T54 — the "Resultados" tab of Campanhas: the report for a
 * period. The dashboard's Canais page shows the same table under its own filters.
 */
export function CampaignResults({ range }: { range?: { from: string; to: string } }) {
  const [period, setPeriod] = useState<ReportPeriod>("this_month");
  const report = useCampaignReport(range ?? reportRange(period));
  const [by, setBy] = useState<"campaign" | "channel">("campaign");
  const { campaigns } = useCampaigns();

  // Sprint 16 · ajuste 3 — por canal: o gasto de todas as campanhas do canal contra
  // os leads, ganhos e receita do canal (o histórico sem anúncio entra no canal).
  const channelRows = useMemo<CampaignReportRow[]>(() => {
    const cat = new Map(campaigns.map((c) => [c.id, c.origin_category]));
    const groups = new Map<string, CampaignReportRow[]>();
    for (const r of report.data ?? []) {
      const k = r.campaign_id ? cat.get(r.campaign_id) ?? "none" : "nocampaign";
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()].map(([k, rs]) => ({
      ...reportTotals(rs),
      campaign_id: k === "nocampaign" ? null : k,
      name: k === "nocampaign" ? "Sem campanha" : k === "none" ? "Sem canal" : originLabel(k as never),
      platform: null,
      status: null,
      goal_leads: null,
    })).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  }, [report.data, campaigns]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(["campaign", "channel"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setBy(v)} className={cn("rounded px-2.5 py-1", by === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
                {v === "campaign" ? "Por campanha" : "Por canal"}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Receita = o que o ganho pôs no livro-razão no período. ROAS = receita ÷ investimento.
          </p>
        </div>
        {!range && (
        <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>{REPORT_PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
      </div>
      <CampaignReportTable rows={by === "channel" ? channelRows : report.data ?? []} isLoading={report.isLoading} label={by === "channel" ? "Canal" : "Campanha"} />
    </div>
  );
}

/**
 * What each campaign brought and cost: leads (first touch in the period), deals,
 * wins, the revenue in the books, the spend — and cost per lead, cost per win,
 * win rate, ROAS and ROI, with a totals line. "Sem campanha" shows what came
 * without one.
 */
export function CampaignReportTable({ rows, isLoading, label = "Campanha" }: { rows: CampaignReportRow[]; isLoading: boolean; label?: string }) {
  const total = reportTotals(rows);

  if (isLoading) {
    return <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nada no período.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-right text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{label}</th>
            <th className="px-3 py-2 font-medium">Leads</th>
            <th className="px-3 py-2 font-medium">Negócios</th>
            <th className="px-3 py-2 font-medium">Ganhos</th>
            <th className="px-3 py-2 font-medium">Taxa de ganho</th>
            <th className="px-3 py-2 font-medium">Receita</th>
            <th className="px-3 py-2 font-medium">Investimento</th>
            <th className="px-3 py-2 font-medium">CPL</th>
            <th className="px-3 py-2 font-medium">Custo por ganho</th>
            <th className="px-3 py-2 font-medium">ROAS</th>
            <th className="px-3 py-2 font-medium">ROI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-right tabular-nums">
          {rows.map((r) => (
            <tr key={r.campaign_id ?? "none"} className={cn(!r.campaign_id && "text-muted-foreground")}>
              <td className="px-3 py-2 text-left">
                <p className="font-medium">{r.name}</p>
                {r.platform && <p className="text-[11px] text-muted-foreground">{platformLabel(r.platform)}</p>}
              </td>
              <td className="px-3 py-2">
                {r.leads}
                {r.goal_leads ? <span className="text-muted-foreground"> / {r.goal_leads}</span> : null}
              </td>
              <td className="px-3 py-2">{r.deals}</td>
              <td className="px-3 py-2">{r.wins}</td>
              <td className="px-3 py-2">{pct(r.win_rate)}</td>
              <td className="px-3 py-2">{brl(r.revenue)}</td>
              <td className="px-3 py-2">{r.spend > 0 ? brl(r.spend) : "—"}</td>
              <td className="px-3 py-2">{brl(r.cpl)}</td>
              <td className="px-3 py-2">{brl(r.cost_per_win)}</td>
              <td className="px-3 py-2">{times(r.roas)}</td>
              <td className={cn("px-3 py-2", r.roi !== null && (r.roi >= 0 ? "text-emerald-600" : "text-destructive"))}>{pct(r.roi)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/30 text-right font-medium tabular-nums">
          <tr>
            <td className="px-3 py-2 text-left">Total</td>
            <td className="px-3 py-2">{total.leads}</td>
            <td className="px-3 py-2">{total.deals}</td>
            <td className="px-3 py-2">{total.wins}</td>
            <td className="px-3 py-2">{pct(total.win_rate)}</td>
            <td className="px-3 py-2">{brl(total.revenue)}</td>
            <td className="px-3 py-2">{total.spend > 0 ? brl(total.spend) : "—"}</td>
            <td className="px-3 py-2">{brl(total.cpl)}</td>
            <td className="px-3 py-2">{brl(total.cost_per_win)}</td>
            <td className="px-3 py-2">{times(total.roas)}</td>
            <td className="px-3 py-2">{pct(total.roi)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
