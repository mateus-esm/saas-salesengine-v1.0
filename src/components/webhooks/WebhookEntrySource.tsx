import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Waypoints } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useEntries } from "@/hooks/useEntries";
import { PLATFORMS } from "@/lib/attribution";

const SELECT = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Sprint 16 — a lead-intake webhook is an entry (porta) of Growth: the source it
 * stamps on every lead (channel, platform, default campaign/program). Only for
 * webhooks that receive leads; other inbound webhooks never get an entry.
 */
export function WebhookEntrySource({ webhookConfigId }: { webhookConfigId: string | null }) {
  const { entries, isLoading, save } = useEntries();
  const { campaigns } = useCampaigns();
  const entry = webhookConfigId ? entries.find((e) => e.webhook_config_id === webhookConfigId) ?? null : null;
  const [cat, setCat] = useState("");
  const [platform, setPlatform] = useState("");
  const [campaign, setCampaign] = useState("");

  useEffect(() => {
    setCat(entry?.origin_category ?? "");
    setPlatform(entry?.platform ?? "");
    setCampaign(entry?.campaign_id ?? "");
  }, [entry?.id, entry?.origin_category, entry?.platform, entry?.campaign_id]);

  const program = campaigns.filter((c) => c.status !== "archived" && (!cat || !c.origin_category || c.origin_category === cat));

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label className="flex items-center gap-1.5"><Waypoints className="h-4 w-4" />Fonte dos leads (Growth)</Label>
      {!webhookConfigId ? (
        <p className="text-xs text-muted-foreground">Salve o webhook primeiro: depois escolha aqui o canal e a campanha/programa que ele carimba em cada lead.</p>
      ) : isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !entry ? (
        <p className="text-xs text-muted-foreground">A entrada deste webhook aparece depois do primeiro save. Recarregue a página.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Todo lead que chegar por aqui leva este carimbo — o que o payload provar (UTM, clique de anúncio) ainda vale mais.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <select aria-label="Canal" className={SELECT} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Canal —</option>
              {ORIGIN_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label="Plataforma" className={SELECT} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">Plataforma —</option>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select aria-label="Campanha ou programa" className={SELECT} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">Campanha / programa —</option>
              {program.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <Link to="/crm?tab=campanhas&section=entradas" className="text-xs text-muted-foreground underline underline-offset-2">
              Responsável e linha: em Growth › Entradas
            </Link>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ id: entry.id, patch: { origin_category: cat || null, platform: platform || null, campaign_id: campaign || null } })}
            >
              {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar fonte
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
