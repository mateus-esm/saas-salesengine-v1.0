import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link2, Loader2, Megaphone, Plus, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { originLabel } from "@/config/originTaxonomy";
import { useCampaigns } from "@/hooks/useCampaigns";
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

import { CampaignDialog } from "./CampaignDialog";
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

type Section = "campanhas" | "entradas";

/**
 * Sprint 11 · Onda 5 · T52 — where leads come from. Campaigns: what each brought
 * and cost, and the UTMs that arrived with no campaign (one click links them —
 * what already came moves too). Entries: every door (webhook, WhatsApp, the AI
 * agent, manual, API) with its stamp and who takes its deals.
 */
export function CampaignsView() {
  const [section, setSection] = useState<Section>("campanhas");
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
            <h1 className="text-xl font-bold text-foreground">Campanhas e entradas</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              De onde vem cada lead: a porta por onde entrou, a campanha, a plataforma e o que custou.
            </p>
          </div>
          {section === "campanhas" && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nova campanha
            </Button>
          )}
        </div>
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <TabsList>
            <TabsTrigger value="campanhas" className="gap-1.5"><Megaphone className="h-4 w-4" />Campanhas</TabsTrigger>
            <TabsTrigger value="entradas" className="gap-1.5"><Waypoints className="h-4 w-4" />Entradas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {section === "campanhas" ? (
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
              {campaigns.length === 0 ? (
                <Empty
                  title="Nenhuma campanha ainda"
                  text="Crie a campanha com as chaves (utm_campaign) que os anúncios mandam; os leads caem nela sozinhos."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Campanha</th>
                        <th className="px-3 py-2 font-medium">Plataforma</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Responsável</th>
                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">Investimento</th>
                        <th className="px-3 py-2 font-medium">Última chegada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campaigns.map((c) => (
                        <tr key={c.id} className={cn("cursor-pointer hover:bg-muted/40", c.status === "archived" && "opacity-60")} onClick={() => setEditing(c)}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{c.name}</p>
                            {c.match_keys.length > 0 && (
                              <p className="truncate text-[11px] text-muted-foreground">{c.match_keys.join(", ")}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{platformLabel(c.platform) ?? "—"}</td>
                          <td className="px-3 py-2">
                            <Badge variant={c.status === "active" ? "default" : "secondary"}>{campaignStatusLabel(c.status)}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{c.owner_id ? nameOf(c.owner_id) ?? "—" : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {c.leads}
                            {c.goal_leads ? <span className="text-muted-foreground"> / {c.goal_leads}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{brl(c.spend)}</td>
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
