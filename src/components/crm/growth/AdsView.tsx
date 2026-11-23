import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Clapperboard, Loader2, Plug, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAds, useAdsReport, useCreatives, useIntegrations } from "@/hooks/useGrowth";
import { REPORT_PERIOD_LABELS, reportRange, type ReportPeriod } from "@/lib/campaigns";
import {
  adMissing,
  adRatios,
  destinationLabel,
  FATIGUE_FREQUENCY,
  sumReport,
  type Ad,
  type AdsReportBase,
  type Creative,
} from "@/lib/growth";
import { cn } from "@/lib/utils";

import { AdDialog } from "./AdDialog";
import { CreativeDialog } from "./CreativeDialog";

type Sub = "desempenho" | "anuncios" | "criativos";

const brl = (v: number | null, digits = 0) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits, minimumFractionDigits: digits })
        .format(v)
        .replace(/\s/g, " ");
const int = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);
const dec = (v: number | null, d = 2) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const ago = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
};

/**
 * Sprint 16 — Ads: which creative sells. Performance puts the manager's numbers
 * (delivery, attention, click, contact) next to Rev's (leads, wins, revenue); a
 * good creative is judged by cost per win, not cost per lead.
 */
export function AdsView() {
  const [sub, setSub] = useState<Sub>("desempenho");
  const { ads, isLoading: adsLoading, save: saveAd } = useAds();
  const { creatives, isLoading: crLoading, save: saveCreative } = useCreatives();
  const { campaigns } = useCampaigns();
  const { windsor } = useIntegrations();
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [newAd, setNewAd] = useState(false);
  const [editingCr, setEditingCr] = useState<Creative | null>(null);
  const [newCr, setNewCr] = useState(false);

  const toReview = ads.filter((a) => a.needs_review && a.status !== "archived").length;
  const connected = windsor && windsor.status !== "disconnected";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {([
            ["desempenho", "Desempenho"],
            ["anuncios", `Anúncios${toReview ? ` · ${toReview} a completar` : ""}`],
            ["criativos", "Criativos"],
          ] as [Sub, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSub(v)}
              className={cn("rounded px-2.5 py-1", sub === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <Link to="/integracoes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Plug className="h-3.5 w-3.5" />
          {connected ? `Windsor · sincronizado ${ago(windsor.last_sync_at)}` : "Conectar o Windsor para puxar gasto e anúncios"}
        </Link>
        <div className="ml-auto flex gap-2">
          {sub === "anuncios" && (
            <Button size="sm" onClick={() => setNewAd(true)}><Plus className="mr-1.5 h-4 w-4" />Novo anúncio</Button>
          )}
          {sub === "criativos" && (
            <Button size="sm" onClick={() => setNewCr(true)}><Plus className="mr-1.5 h-4 w-4" />Novo criativo</Button>
          )}
        </div>
      </div>

      {sub === "desempenho" ? (
        <Performance />
      ) : sub === "anuncios" ? (
        adsLoading ? <Spinner /> : ads.length === 0 ? (
          <Empty
            title="Nenhum anúncio ainda"
            text="Conecte o Windsor em Integrações (os anúncios aparecem sozinhos) ou cadastre cada anúncio novo pelo formulário."
          />
        ) : (
          <div className="space-y-2">
            {toReview > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-800/60 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {toReview} anúncio(s) sem campanha, criativo ou destino. Complete para os leads e o gasto contarem no lugar certo.
              </div>
            )}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                    <th>Anúncio</th>
                    <th>Criativo</th>
                    <th>Campanha no Rev</th>
                    <th>Destino</th>
                    <th className="text-right">Gasto 30d</th>
                    <th className="text-right">Leads</th>
                    <th>Visto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ads.map((a) => {
                    const missing = adMissing(a);
                    return (
                      <tr key={a.id} className={cn("cursor-pointer hover:bg-muted/40", a.status === "archived" && "opacity-60")} onClick={() => setEditingAd(a)}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                          <Thumb url={a.thumbnail_url} />
                          <div className="min-w-0">
                          <p className="font-medium">{a.ad_name ?? a.external_ad_id ?? "Sem nome"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {a.platform === "meta" ? "Meta" : a.platform === "google" ? "Google" : a.platform}
                            {a.external_ad_id ? ` · ${a.external_ad_id}` : ""}
                            {a.campaign_name ? ` · ${a.campaign_name}` : ""}
                          </p>
                          </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">{a.creative_code ? <code className="text-xs">{a.creative_code}</code> : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{a.crm_campaign_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{destinationLabel(a.destination)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{brl(a.spend_30d)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.leads}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="secondary" className="text-[10px]">{a.source === "windsor" ? "Windsor" : "Manual"}</Badge>
                            {missing.length > 0 && a.status !== "archived" && (
                              <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-300">
                                falta {missing.join(", ")}
                              </Badge>
                            )}
                            {a.last_seen_at && <span className="text-[11px] text-muted-foreground">{ago(a.last_seen_at)}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : crLoading ? (
        <Spinner />
      ) : creatives.length === 0 ? (
        <Empty
          title="Nenhum criativo ainda"
          text="Cadastre o código que o estúdio entrega (P002-V3). Se o nome do anúncio começar com ele, o Windsor cria o criativo sozinho."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th>Código</th>
                <th>Peça</th>
                <th>Formato</th>
                <th>Entregue</th>
                <th className="text-right">Anúncios</th>
                <th className="text-right">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creatives.map((c) => (
                <tr key={c.id} className={cn("cursor-pointer hover:bg-muted/40", c.status === "archived" && "opacity-60")} onClick={() => setEditingCr(c)}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Thumb url={c.thumbnail_url} />
                      <code className="text-xs font-semibold">{c.code}</code>
                    </div>
                  </td>
                  <td className="px-3 py-2">{c.title || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.format ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.delivered_on ? c.delivered_on.split("-").reverse().join("/") : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.ads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdDialog
        open={newAd || !!editingAd}
        ad={editingAd}
        campaigns={campaigns}
        creatives={creatives}
        saving={saveAd.isPending}
        onClose={() => {
          setNewAd(false);
          setEditingAd(null);
        }}
        onSave={(d) => saveAd.mutateAsync(d)}
      />
      <CreativeDialog
        open={newCr || !!editingCr}
        creative={editingCr}
        saving={saveCreative.isPending}
        onClose={() => {
          setNewCr(false);
          setEditingCr(null);
        }}
        onSave={(d) => saveCreative.mutateAsync(d)}
      />
    </div>
  );
}

function Thumb({ url, size = "h-9 w-9" }: { url?: string | null; size?: string }) {
  return url ? (
    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn(size, "shrink-0 rounded object-cover")} />
  ) : (
    <div className={cn(size, "shrink-0 rounded bg-muted")} />
  );
}

function Performance() {
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const { ads: adList } = useAds();
  const { creatives: crList } = useCreatives();
  const thumbs = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const a of adList) m.set(a.id, a.thumbnail_url);
    for (const c of crList) m.set(c.id, c.thumbnail_url);
    return m;
  }, [adList, crList]);
  const [by, setBy] = useState<"creative" | "ad">("creative");
  const range = useMemo(() => reportRange(period), [period]);
  const { data, isLoading } = useAdsReport(range.from, range.to);

  const rows = useMemo(() => {
    if (!data) return [];
    return by === "creative"
      ? data.creatives.map((c) => ({ key: c.id, title: c.code, sub: [c.title, c.ads ? `${c.ads} anúncio(s)` : null].filter(Boolean).join(" · "), r: c as AdsReportBase }))
      : data.ads.map((a) => ({
          key: a.id,
          title: a.ad_name ?? a.external_ad_id ?? "Sem nome",
          sub: [a.creative_code, a.campaign ?? "Sem campanha"].filter(Boolean).join(" · "),
          r: a as AdsReportBase,
        }));
  }, [data, by]);
  const total = useMemo(() => sumReport(rows.map((x) => x.r)), [rows]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>
          {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map((p) => <option key={p} value={p}>{REPORT_PERIOD_LABELS[p]}</option>)}
        </select>
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(["creative", "ad"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setBy(v)} className={cn("rounded px-2.5 py-1", by === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
              {v === "creative" ? "Por criativo" : "Por anúncio"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          O gerenciador diz se o anúncio chama atenção; o Rev diz se o contato vira venda. Compare criativos pelo custo por ganho.
        </p>
      </div>

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title="Nada no período" text="Sem gasto nem leads ligados a anúncios ou criativos nestas datas." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-max min-w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-medium">
                <th />
                <th colSpan={7} className="border-l border-border text-center">Gerenciador</th>
                <th colSpan={6} className="border-l border-border text-center">Rev</th>
              </tr>
              <tr className="text-right [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="text-left">{by === "creative" ? "Criativo" : "Anúncio"}</th>
                <th className="border-l border-border">Gasto</th>
                <th title="gasto ÷ mil impressões">CPM</th>
                <th title={`impressões ÷ alcance (acima de ~${FATIGUE_FREQUENCY}, o público cansa)`}>Freq.</th>
                <th title="visualizações de 3s ÷ impressões">Gancho</th>
                <th title="ThruPlays ÷ visualizações de 3s">Retenção</th>
                <th title="cliques ÷ impressões">CTR</th>
                <th title="gasto ÷ leads + conversas contadas pela plataforma">Custo/contato</th>
                <th className="border-l border-border">Leads</th>
                <th>CPL</th>
                <th>Negócios</th>
                <th>Ganhos</th>
                <th title="gasto ÷ negócios ganhos (CAC de mídia)">Custo/ganho</th>
                <th title="receita fechada ÷ gasto">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ key, title, sub, r }) => <ReportLine key={key} title={title} sub={sub} r={r} thumb={thumbs.get(key)} />)}
              <ReportLine title="Total" r={total} strong />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportLine({ title, sub, r, strong, thumb }: { title: string; sub?: string; r: AdsReportBase; strong?: boolean; thumb?: string | null }) {
  const x = adRatios(r);
  return (
    <tr className={cn("text-right tabular-nums [&>td]:whitespace-nowrap [&>td]:px-3 [&>td]:py-2", strong && "bg-muted/40 font-semibold")}>
      <td className="text-left">
        <div className="flex items-center gap-2">
          {!strong && <Thumb url={thumb} size="h-8 w-8" />}
          <div className="min-w-0">
            <p className="font-medium">{title}</p>
            {sub && <p className="max-w-[260px] truncate text-[11px] font-normal text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </td>
      <td className="border-l border-border">{brl(r.spend)}</td>
      <td>{brl(x.cpm, 2)}</td>
      <td className={cn(x.frequency !== null && x.frequency > FATIGUE_FREQUENCY && "text-amber-600")}>{dec(x.frequency)}</td>
      <td>{pct(x.hook_rate)}</td>
      <td>{pct(x.retention)}</td>
      <td>{pct(x.ctr)}</td>
      <td>{brl(x.cost_per_contact, 2)}</td>
      <td className="border-l border-border">{int(r.leads)}</td>
      <td>{brl(x.cpl, 2)}</td>
      <td>{int(r.deals)}</td>
      <td>{int(r.wins)}</td>
      <td>{brl(x.cost_per_win)}</td>
      <td>{x.roas === null ? "—" : `${dec(x.roas, 1)}×`}</td>
    </tr>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <Clapperboard className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
