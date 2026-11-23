import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBrNumber } from "@/lib/fields/registry";
import {
  AD_DESTINATIONS,
  AD_PLATFORMS,
  AD_STATUSES,
  adDraftError,
  creativeCodeOf,
  emptyAdDraft,
  objectiveLabel,
  type Ad,
  type AdDraft,
  type Creative,
} from "@/lib/growth";

const SELECT = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

const toDraft = (a: Ad | null): AdDraft => {
  if (!a) return emptyAdDraft();
  return {
    id: a.id, platform: a.platform, external_ad_id: a.external_ad_id, ad_name: a.ad_name,
    adset_external_id: a.adset_external_id, adset_name: a.adset_name, campaign_external_id: a.campaign_external_id,
    campaign_name: a.campaign_name, campaign_id: a.campaign_id, creative_id: a.creative_id, destination: a.destination,
    form_name: a.form_name, prefill_message: a.prefill_message, starts_on: a.starts_on, ends_on: a.ends_on,
    daily_budget: a.daily_budget, status: a.status,
  };
};

/**
 * Sprint 16 — the performance form: one per new ad (or to complete one the Windsor
 * found). The IDs are what the lead carries; the campaign and creative are where
 * it counts; the default WhatsApp message catches leads that arrive without an ad ID.
 */
export function AdDialog({
  open,
  ad,
  campaigns,
  creatives,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  ad: Ad | null;
  campaigns: { id: string; name: string; status: string }[];
  creatives: Creative[];
  saving: boolean;
  onClose: () => void;
  onSave: (d: AdDraft) => Promise<unknown>;
}) {
  const [d, setD] = useState<AdDraft>(toDraft(ad));
  const [budget, setBudget] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setD(toDraft(ad));
      setBudget(ad?.daily_budget ? String(ad.daily_budget).replace(".", ",") : "");
      setErr(null);
    }
  }, [open, ad]);

  const set = <K extends keyof AdDraft>(k: K, v: AdDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof AdDraft) => ({
    value: (d[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, (e.target.value || null) as never),
  });
  const fromWindsor = ad?.source === "windsor";
  const suggested = !d.creative_id ? creatives.find((c) => c.code === creativeCodeOf(d.ad_name)) : null;

  const submit = async () => {
    const draft = { ...d, daily_budget: parseBrNumber(budget) };
    const e = adDraftError(draft);
    if (e) return setErr(e);
    try {
      await onSave(draft);
      onClose();
    } catch {
      /* toast already shown */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ad ? "Anúncio" : "Novo anúncio"}</DialogTitle>
          <DialogDescription>
            {fromWindsor
              ? "Encontrado pelo Windsor. Os IDs e nomes vêm da plataforma; complete o que só a equipe sabe."
              : "Preencha no dia em que o anúncio sobe. Sem o ID do anúncio, o lead cai em “Sem campanha”."}
          </DialogDescription>
        </DialogHeader>

        {fromWindsor && ad && <ManagerCard ad={ad} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plataforma">
            <select className={SELECT} value={d.platform} disabled={fromWindsor} onChange={(e) => set("platform", e.target.value as AdDraft["platform"])}>
              {AD_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={SELECT} value={d.status} onChange={(e) => set("status", e.target.value as AdDraft["status"])}>
              {AD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Nome do anúncio" hint="CÓDIGO | PEÇA | FORMATO — ex.: P002-V3 | Carmona ponta a ponta | reels 52s" wide>
            <Input {...text("ad_name")} disabled={fromWindsor} />
          </Field>
          <Field label="ID do anúncio" hint="É o que chega no lead de WhatsApp">
            <Input {...text("external_ad_id")} disabled={fromWindsor} placeholder="120211…" />
          </Field>
          <Field label="Criativo">
            <select className={SELECT} value={d.creative_id ?? ""} onChange={(e) => set("creative_id", e.target.value || null)}>
              <option value="">{suggested ? `— (o código ${suggested.code} será usado)` : "—"}</option>
              {creatives.filter((c) => c.status !== "archived" || c.id === d.creative_id).map((c) => (
                <option key={c.id} value={c.id}>{c.code}{c.title ? ` · ${c.title}` : ""}</option>
              ))}
            </select>
          </Field>

          <Field label="Campanha na plataforma (nome)">
            <Input {...text("campaign_name")} disabled={fromWindsor} placeholder="2026-11 | MSG | Tema | Praça" />
          </Field>
          <Field label="ID da campanha" hint="A chave que não muda quando renomeiam">
            <Input {...text("campaign_external_id")} disabled={fromWindsor} placeholder="120210…" />
          </Field>
          <Field label="Campanha no Rev" hint="Onde os leads e o gasto contam" wide>
            <select className={SELECT} value={d.campaign_id ?? ""} onChange={(e) => set("campaign_id", e.target.value || null)}>
              <option value="">— Sem campanha</option>
              {campaigns.filter((c) => c.status !== "archived" || c.id === d.campaign_id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Conjunto (nome)">
            <Input {...text("adset_name")} disabled={fromWindsor} placeholder="Proprietários 30-55 | Reels" />
          </Field>
          <Field label="ID do conjunto">
            <Input {...text("adset_external_id")} disabled={fromWindsor} />
          </Field>

          <Field label="Destino" hint={d.destination ? `Chave de devolução: ${AD_DESTINATIONS.find((x) => x.value === d.destination)?.key}` : undefined}>
            <select className={SELECT} value={d.destination ?? ""} onChange={(e) => set("destination", (e.target.value || null) as AdDraft["destination"])}>
              <option value="">—</option>
              {AD_DESTINATIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </Field>
          {d.destination === "form" ? (
            <Field label="Formulário">
              <Input {...text("form_name")} placeholder="FORMULÁRIO SOLON" />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}

          {d.destination === "whatsapp" && (
            <Field label="Mensagem pré-preenchida (WhatsApp)" hint="O lead que chega começando com esta frase é ligado a este anúncio, mesmo sem o ID." wide>
              <Textarea rows={2} {...text("prefill_message")} placeholder="Oi! Vi o projeto de engenharia da Solo" />
            </Field>
          )}

          <Field label="Início">
            <Input type="date" value={d.starts_on ?? ""} onChange={(e) => set("starts_on", e.target.value || null)} />
          </Field>
          <Field label="Fim">
            <Input type="date" value={d.ends_on ?? ""} onChange={(e) => set("ends_on", e.target.value || null)} />
          </Field>
          <Field label="Verba (R$/dia)">
            <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0,00" />
          </Field>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Sprint 16 · ajuste 1 — what the ads manager says about this ad (read-only, from the Windsor). */
function ManagerCard({ ad }: { ad: Ad }) {
  const rows: [string, string | null | undefined][] = [
    ["Objetivo", objectiveLabel(ad.objective)],
    ["Destino no gerenciador", ad.destination_type],
    ["Botão", ad.cta],
    ["Status", ad.effective_status],
    ["Verba/dia", ad.platform_daily_budget ? `R$ ${Number(ad.platform_daily_budget).toLocaleString("pt-BR")}` : null],
    ["Conjunto", ad.adset_name],
  ];
  return (
    <div className="flex gap-3 rounded-md border border-border bg-muted/30 p-3">
      {ad.thumbnail_url && <img src={ad.thumbnail_url} alt="" className="h-20 w-20 shrink-0 rounded object-cover" referrerPolicy="no-referrer" />}
      <div className="min-w-0 flex-1 space-y-1 text-xs">
        <p className="font-medium text-foreground">Do gerenciador</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <p key={k} className="truncate"><span className="text-muted-foreground">{k}: </span>{v}</p>
          ))}
        </div>
        {ad.headline && <p className="truncate"><span className="text-muted-foreground">Título: </span>{ad.headline}</p>}
        {ad.body && <p className="line-clamp-2 text-muted-foreground">{ad.body}</p>}
        {ad.preview_url && (
          <a href={ad.preview_url} target="_blank" rel="noreferrer" className="inline-block underline underline-offset-2">Ver prévia do anúncio</a>
        )}
      </div>
    </div>
  );
}
