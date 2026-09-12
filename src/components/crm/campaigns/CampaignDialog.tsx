import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useCampaignSpend } from "@/hooks/useCampaigns";
import { PLATFORMS } from "@/lib/attribution";
import { parseBrNumber } from "@/lib/fields/registry";
import {
  CAMPAIGN_STATUSES,
  campaignDraftError,
  normalizeMatchKeys,
  type Campaign,
  type CampaignDraft,
} from "@/lib/campaigns";
import type { OriginCategory } from "@/types/crm";

import { UserPicker } from "../fields/UserPicker";

const NONE = "__none__";
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");
const day = (iso: string) => {
  try {
    return format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");
  } catch {
    return iso;
  }
};
const numOrNull = (v: string): number | null => parseBrNumber(v);

const toDraft = (c: Campaign | null): CampaignDraft => ({
  ...(c ? { id: c.id } : {}),
  name: c?.name ?? "",
  platform: c?.platform ?? null,
  origin_category: c?.origin_category ?? null,
  owner_id: c?.owner_id ?? null,
  goal_leads: c?.goal_leads ?? null,
  goal_deals: c?.goal_deals ?? null,
  goal_revenue: c?.goal_revenue ?? null,
  starts_on: c?.starts_on ?? null,
  ends_on: c?.ends_on ?? null,
  status: c?.status ?? "active",
  match_keys: c?.match_keys ?? [],
});

interface CampaignDialogProps {
  open: boolean;
  campaign: Campaign | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: CampaignDraft) => Promise<unknown>;
}

/**
 * Sprint 11 · Onda 5 · T52 — a campaign: platform, category, owner, dates, goals
 * and the keys (utm_campaign values or platform IDs) that fall into it; editing
 * shows its spend entries (manual now; the ad platforms' APIs later).
 */
export function CampaignDialog({ open, campaign, saving, onClose, onSave }: CampaignDialogProps) {
  const [draft, setDraft] = useState<CampaignDraft>(toDraft(campaign));
  const [keysText, setKeysText] = useState("");
  const [goalLeads, setGoalLeads] = useState("");
  const [goalDeals, setGoalDeals] = useState("");
  const [goalRevenue, setGoalRevenue] = useState("");

  useEffect(() => {
    if (!open) return;
    const d = toDraft(campaign);
    setDraft(d);
    setKeysText(d.match_keys.join(", "));
    setGoalLeads(d.goal_leads?.toString() ?? "");
    setGoalDeals(d.goal_deals?.toString() ?? "");
    setGoalRevenue(d.goal_revenue?.toString().replace(".", ",") ?? "");
  }, [open, campaign]);

  const full: CampaignDraft = {
    ...draft,
    match_keys: normalizeMatchKeys(keysText),
    goal_leads: numOrNull(goalLeads),
    goal_deals: numOrNull(goalDeals),
    goal_revenue: numOrNull(goalRevenue),
  };
  const error = campaignDraftError(full);

  const submit = async () => {
    if (error) return;
    try {
      await onSave(full);
      onClose();
    } catch {
      // the hook shows the error; the dialog stays open
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{campaign ? "Editar campanha" : "Nova campanha"}</DialogTitle>
          <DialogDescription>
            O lead cai na campanha pela chave que chega com ele (utm_campaign ou o ID da campanha na plataforma), ou
            pela campanha padrão da entrada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="camp-name">Nome</Label>
            <Input id="camp-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Plataforma</Label>
              <Select value={draft.platform ?? NONE} onValueChange={(v) => setDraft({ ...draft, platform: v === NONE ? null : (v as CampaignDraft["platform"]) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={draft.origin_category ?? NONE} onValueChange={(v) => setDraft({ ...draft, origin_category: v === NONE ? null : (v as OriginCategory) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {ORIGIN_CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <UserPicker value={draft.owner_id} onChange={(owner_id) => setDraft({ ...draft, owner_id })} ariaLabel="Responsável" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as CampaignDraft["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-start">Início</Label>
              <Input id="camp-start" type="date" value={draft.starts_on ?? ""} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value || null })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-end">Fim</Label>
              <Input id="camp-end" type="date" value={draft.ends_on ?? ""} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value || null })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="camp-gl" className="text-xs">Meta de leads</Label>
              <Input id="camp-gl" inputMode="numeric" value={goalLeads} onChange={(e) => setGoalLeads(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-gd" className="text-xs">Meta de ganhos</Label>
              <Input id="camp-gd" inputMode="numeric" value={goalDeals} onChange={(e) => setGoalDeals(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-gr" className="text-xs">Meta de receita</Label>
              <Input id="camp-gr" inputMode="decimal" value={goalRevenue} onChange={(e) => setGoalRevenue(e.target.value)} placeholder="R$" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="camp-keys">Chaves (utm_campaign ou ID da campanha)</Label>
            <Textarea id="camp-keys" value={keysText} onChange={(e) => setKeysText(e.target.value)} placeholder="usina_verao, 23850000000001" className="min-h-[56px]" />
            <p className="text-[11px] text-muted-foreground">Separe por vírgula. Maiúsculas não importam.</p>
          </div>

          {campaign && <SpendSection campaignId={campaign.id} />}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={!!error || saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpendSection({ campaignId }: { campaignId: string }) {
  const { spend, add, remove } = useCampaignSpend(campaignId);
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const value = numOrNull(amount);
  const total = spend.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">Investimento</p>
        <span className="text-sm tabular-nums">{brl(total)}</span>
      </div>
      <div className="flex gap-2">
        <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className="h-8 w-36 text-xs" aria-label="Dia" />
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor (R$)" className="h-8 text-xs" aria-label="Valor" />
        <Button
          size="sm"
          className="h-8"
          disabled={value === null || value < 0 || !spentOn || add.isPending}
          onClick={() => add.mutate({ spent_on: spentOn, amount: value ?? 0 }, { onSuccess: () => setAmount("") })}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {spend.length > 0 && (
        <ul className="max-h-36 space-y-1 overflow-y-auto">
          {spend.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="tabular-nums text-muted-foreground">{day(s.spent_on)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.note ?? (s.source === "manual" ? "" : s.source)}</span>
              <span className="tabular-nums">{brl(s.amount)}</span>
              {s.source === "manual" && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove.mutate(s.id)} aria-label="Apagar lançamento">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
