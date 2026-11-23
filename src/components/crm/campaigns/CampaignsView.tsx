import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, Clapperboard, FlaskConical, Link2, Loader2, Megaphone, Plus, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { originLabel } from "@/config/originTaxonomy";
import { useCampaignReport, useCampaigns } from "@/hooks/useCampaigns";
import { useReferrers, useUnlinkedSources } from "@/hooks/useGrowth";
import { growthRange, type GrowthPeriod } from "@/lib/growthPeriod";
import { useEntries } from "@/hooks/useEntries";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { platformLabel } from "@/lib/attribution";
import {
  campaignStatusLabel,
  ENTRY_KIND_LABEL,
  ownerRuleLabel,
  type Campaign,
  type Entry,
  type UnmatchedUtm,
} from "@/lib/campaigns";
import { cn } from "@/lib/utils";

import { AdsView } from "../growth/AdsView";
import { ExperimentsSheet } from "../growth/ExperimentsSheet";
import { GrowthPeriodBar } from "../growth/GrowthPeriodBar";
import { CampaignDialog } from "./CampaignDialog";
import { CampaignResults } from "./CampaignResults";
import { EntryDialog } from "./EntryDialog";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v).replace(/\u00a0/g, " ");
const ago = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
};

type Section = "experimentos" | "campanhas" | "ads" | "resultados" | "entradas";
const SECTIONS: Section[] = ["experimentos", "campanhas", "ads", "resultados", "entradas"];

/**
 * Sprint 11 · Onda 5 · T52 — where leads come from. Campaigns: what each brought
 * and cost, and the UTMs that arrived with no campaign (one click links them —
 * what already came moves too). Entries: every door (webhook, WhatsApp, the AI
 * agent, manual, API) with its stamp and who takes its deals.
 */
export function CampaignsView() {
  // Sprint 16 — Growth: a seção vive na URL (?tab=campanhas&section=ads) para o link de volta.
  const [params, setParams] = useSearchParams();
  const raw = params.get("section") as Section | null;
  const section: Section = raw && SECTIONS.includes(raw) ? raw : "experimentos";
  const setSection = (v: Section) => {
    const next = new URLSearchParams(params);
    next.set("section", v);
    setParams(next, { replace: true });
  };
  const [channel, setChannel] = useState<string>("all");
  // Sprint 16 · ajuste 3 — um período para todas as abas (?gp=…&gf=…&gt=…).
  const gp = params.get("gp") ?? "30d";
  const gf = params.get("gf") ?? "";
  const gt = params.get("gt") ?? "";
  const range = useMemo(() => growthRange(gp, gf, gt), [gp, gf, gt]);
  const setPeriod = (period: GrowthPeriod, from?: string, to?: string) => {
    const next = new URLSearchParams(params);
    next.set("gp", period);
    if (period === "custom") {
      next.set("gf", from ?? "");
      next.set("gt", to ?? "");
    } else {
      next.delete("gf");
      next.delete("gt");
    }
    setParams(next, { replace: true });
  };
  const periodReport = useCampaignReport({ from: range.from, to: range.to });
  const inPeriod = useMemo(() => new Map((periodReport.data ?? []).map((r) => [r.campaign_id, r])), [periodReport.data]);
  const { campaigns, isLoading, unmatched, save, linkUtm } = useCampaigns();
  const { entries, isLoading: entriesLoading, save: saveEntry } = useEntries();
  const { nameOf } = useMemberDirectory();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Growth</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Planeje e teste cada fonte de captação — anúncios, indicação, eventos, parcerias — e veja o que vira venda.
            </p>
          </div>
          {section === "campanhas" && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nova campanha
            </Button>
          )}
        </div>
        {section !== "entradas" && (
          <GrowthPeriodBar range={range} selected={gp} customFrom={gf} customTo={gt} onChange={setPeriod} />
        )}
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <TabsList>
            <TabsTrigger value="experimentos" className="gap-1.5"><FlaskConical className="h-4 w-4" />Experimentos</TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-1.5"><Megaphone className="h-4 w-4" />Canais & campanhas</TabsTrigger>
            <TabsTrigger value="ads" className="gap-1.5"><Clapperboard className="h-4 w-4" />Ads</TabsTrigger>
            <TabsTrigger value="resultados" className="gap-1.5"><BarChart3 className="h-4 w-4" />Resultados</TabsTrigger>
            <TabsTrigger value="entradas" className="gap-1.5"><Waypoints className="h-4 w-4" />Entradas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {section === "experimentos" ? (
          <ExperimentsSheet range={range} />
        ) : section === "ads" ? (
          <AdsView range={range} />
        ) : section === "resultados" ? (
          <CampaignResults range={range} />
        ) : section === "campanhas" ? (
          isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-4">
              {unmatched.length > 0 && (
                <UnmatchedCard
                  unmatched={unmatched}
                  campaigns={campaigns}
                  linking={linkUtm.isPending}
                  onLink={(campaignId, value) => linkUtm.mutate({ campaignId, value })}
                />
              )}
              {campaigns.length > 0 && <ChannelChips campaigns={campaigns} value={channel} onChange={setChannel} />}
              {channel === "referral" && <ReferrersCard />}
              <UnlinkedSourcesCard campaigns={campaigns} />
              {campaigns.length === 0 ? (
                <Empty
                  title="Nenhuma campanha ainda"
                  text="Uma campanha por iniciativa de captação: anúncios (com as chaves utm_campaign), um programa de indicação, um evento. Os leads caem nela sozinhos."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Campanha</th>
                        <th className="px-3 py-2 font-medium">Canal</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Responsável</th>
                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">Ganhos</th>
                        <th className="px-3 py-2 text-right font-medium">Investimento</th>
                        <th className="px-3 py-2 text-right font-medium">ROAS</th>
                        <th className="px-3 py-2 font-medium">Última chegada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campaigns.filter((c) => channel === "all" || (c.origin_category ?? "none") === channel).map((c) => (
                        <tr key={c.id} className={cn("cursor-pointer hover:bg-muted/40", c.status === "archived" && "opacity-60")} onClick={() => setEditing(c)}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{c.name}</p>
                            {c.match_keys.length > 0 && (
                              <p className="truncate text-[11px] text-muted-foreground">{c.match_keys.join(", ")}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {[c.origin_category ? originLabel(c.origin_category) : null, platformLabel(c.platform)].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={c.status === "active" ? "default" : "secondary"}>{campaignStatusLabel(c.status)}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{c.owner_id ? nameOf(c.owner_id) ?? "—" : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {inPeriod.get(c.id)?.leads ?? 0}
                            {c.goal_leads ? <span className="text-muted-foreground"> / {c.goal_leads}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{inPeriod.get(c.id)?.wins ?? 0}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{brl(inPeriod.get(c.id)?.spend ?? 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {inPeriod.get(c.id)?.roas != null ? `${Number(inPeriod.get(c.id)?.roas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×` : "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{ago(c.last_touch_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        ) : entriesLoading ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <Empty title="Nenhuma entrada ainda" text="Cada webhook de entrada, número de WhatsApp e o agente viram uma entrada aqui." />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Entrada</th>
                  <th className="px-3 py-2 font-medium">Carimbo</th>
                  <th className="px-3 py-2 font-medium">Campanha padrão</th>
                  <th className="px-3 py-2 font-medium">Quem pega</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 font-medium">Última chegada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id} className={cn("cursor-pointer hover:bg-muted/40", !e.active && "opacity-60")} onClick={() => setEditingEntry(e)}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{e.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {ENTRY_KIND_LABEL[e.kind]}
                        {e.pipeline_name ? ` · ${e.pipeline_name}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[originLabel(e.origin_category), platformLabel(e.platform)].filter((x) => x && x !== "—").join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{e.campaign_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{ownerRuleLabel(e.owner_rule, nameOf)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.leads}</td>
                    <td className="px-3 py-2 text-muted-foreground">{ago(e.last_touch_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CampaignDialog
        open={creating || !!editing}
        campaign={editing}
        saving={save.isPending}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={(draft) => save.mutateAsync(draft)}
      />
      <EntryDialog
        entry={editingEntry}
        campaigns={campaigns}
        saving={saveEntry.isPending}
        onClose={() => setEditingEntry(null)}
        onSave={(id, patch) => saveEntry.mutateAsync({ id, patch })}
      />
    </div>
  );
}

function UnmatchedCard({
  unmatched,
  campaigns,
  linking,
  onLink,
}: {
  unmatched: UnmatchedUtm[];
  campaigns: Campaign[];
  linking: boolean;
  onLink: (campaignId: string, value: string) => void;
}) {
  const [target, setTarget] = useState<Record<string, string>>({});
  const open = campaigns.filter((c) => c.status !== "archived");
  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-950/20">
      <p className="text-sm font-medium">UTMs sem campanha</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Chegaram com uma utm_campaign que nenhuma campanha reconhece. Ligue a uma campanha — o que já chegou passa junto.
      </p>
      <ul className="space-y-1.5">
        {unmatched.map((u) => (
          <li key={u.value} className="flex flex-wrap items-center gap-2 text-sm">
            <code className="rounded bg-background px-1.5 py-0.5 text-xs">{u.value}</code>
            <span className="text-xs text-muted-foreground">
              {u.touches} chegada(s){u.platform ? ` · ${platformLabel(u.platform)}` : ""} · {ago(u.last_at)}
            </span>
            {open.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5">
                <Select value={target[u.value] ?? ""} onValueChange={(v) => setTarget((t) => ({ ...t, [u.value]: v }))}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Ligar a…" /></SelectTrigger>
                  <SelectContent>
                    {open.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!target[u.value] || linking} onClick={() => onLink(target[u.value], u.value)}>
                  <Link2 className="mr-1 h-3 w-3" /> Ligar
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sprint 16 · ajuste 3 — leads sem campanha, agrupados pela origem antiga
 * ("Tráfego Pago", "Indicação"…). Ligar um grupo a uma campanha põe esses leads no
 * retorno; "Criar campanha" cria uma com o nome e o canal do grupo.
 */
function UnlinkedSourcesCard({ campaigns }: { campaigns: Campaign[] }) {
  const { groups, link } = useUnlinkedSources();
  const { save } = useCampaigns();
  const [target, setTarget] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  const total = groups.reduce((s, g) => s + g.leads, 0);
  const openCamps = campaigns.filter((c) => c.status !== "archived");
  const keyOf = (g: { origin_category: string | null; label: string }) => `${g.origin_category ?? ""}|${g.label}`;
  const create = async (g: { origin_category: string | null; label: string }) => {
    const camp = (await save.mutateAsync({
      name: g.label.slice(0, 120),
      platform: g.origin_category === "paid_social" ? "meta" : g.origin_category === "paid_search" ? "google" : null,
      origin_category: (g.origin_category as Campaign["origin_category"]) ?? null,
      owner_id: null, goal_leads: null, goal_deals: null, goal_revenue: null,
      starts_on: null, ends_on: null, status: "active", match_keys: [],
    })) as unknown as { id: string };
    if (camp?.id) link.mutate({ campaignId: camp.id, origin_category: g.origin_category, label: g.label });
  };
  return (
    <div className="rounded-md border border-sky-300/60 bg-sky-50/50 p-3 dark:border-sky-800/60 dark:bg-sky-950/20">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-sm font-medium">Leads sem campanha · {total}</span>
        <span className="text-xs text-muted-foreground">{open ? "Fechar" : "Ligar a campanhas para entrar no retorno"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {groups.map((g) => (
            <li key={keyOf(g)} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{g.label}</span>
              <span className="text-xs text-muted-foreground">
                {g.origin_category ? originLabel(g.origin_category as Campaign["origin_category"]) : "Sem canal"} · {g.leads} lead(s)
                {g.wins ? ` · ${g.wins} ganho(s)` : ""}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Select value={target[keyOf(g)] ?? ""} onValueChange={(v) => setTarget((t) => ({ ...t, [keyOf(g)]: v }))}>
                  <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="Ligar a…" /></SelectTrigger>
                  <SelectContent>
                    {openCamps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!target[keyOf(g)] || link.isPending}
                  onClick={() => link.mutate({ campaignId: target[keyOf(g)], origin_category: g.origin_category, label: g.label })}>
                  <Link2 className="mr-1 h-3 w-3" /> Ligar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={save.isPending || link.isPending} onClick={() => void create(g)}>
                  <Plus className="mr-1 h-3 w-3" /> Criar campanha
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sprint 16 — quem mais indica, no canal Indicação. */
function ReferrersCard() {
  const { data = [], isLoading } = useReferrers(null);
  if (isLoading) return null;
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">Quem mais indica</p>
      {data.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Ninguém ainda. Ao cadastrar um contato com origem Indicação, escolha o programa e “Indicado por”.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border text-sm">
          {data.slice(0, 10).map((r) => (
            <li key={r.lead_id} className="flex items-center justify-between py-1.5">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {r.referrals} indicação(ões) · {r.wins} ganho(s){r.revenue ? ` · ${brl(r.revenue)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sprint 16 — os canais (categoria de origem) das campanhas, para filtrar. */
function ChannelChips({ campaigns, value, onChange }: { campaigns: Campaign[]; value: string; onChange: (v: string) => void }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of campaigns) m.set(c.origin_category ?? "none", (m.get(c.origin_category ?? "none") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [campaigns]);
  if (counts.length < 2) return null;
  const chip = (v: string, label: string, n: number) => (
    <button
      key={v}
      type="button"
      onClick={() => onChange(v)}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs",
        value === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label} <span className="opacity-70">{n}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {chip("all", "Todos", campaigns.length)}
      {counts.map(([k, n]) => chip(k, k === "none" ? "Sem canal" : originLabel(k as Campaign["origin_category"]), n))}
    </div>
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
      <Megaphone className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
