import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import type { EntryPatch } from "@/hooks/useEntries";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { usePipelines } from "@/hooks/usePipelines";
import { PLATFORMS } from "@/lib/attribution";
import { ENTRY_KIND_LABEL, type Campaign, type Entry, type OwnerRuleMode } from "@/lib/campaigns";

const NONE = "__none__";

interface EntryDialogProps {
  entry: Entry | null;
  campaigns: Campaign[];
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, patch: EntryPatch) => Promise<unknown>;
}

/**
 * Sprint 11 · Onda 5 · T52 — an entry's stamp: what a lead that comes through it
 * is (category, platform, default campaign — the payload's UTMs and click IDs win
 * when they prove something else) and who takes the deal it brings.
 */
export function EntryDialog({ entry, campaigns, saving, onClose, onSave }: EntryDialogProps) {
  const { members, nameOf } = useMemberDirectory();
  const { pipelines } = usePipelines();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [mode, setMode] = useState<OwnerRuleMode>("none");
  const [users, setUsers] = useState<string[]>([]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setCategory(entry.origin_category);
    setPlatform(entry.platform);
    setCampaignId(entry.campaign_id);
    setPipelineId(entry.pipeline_id);
    setMode(entry.owner_rule.mode);
    setUsers(entry.owner_rule.user_ids);
    setActive(entry.active);
  }, [entry]);

  if (!entry) return null;
  const isWebhook = entry.kind === "webhook";
  // Sprint 11 · T55 — the number and the agent send a new deal to their line;
  // manual and import pick the line on the spot; a webhook's is the webhook's.
  const routesToLine = entry.kind === "whatsapp" || entry.kind === "agent";
  const toggleUser = (id: string, on: boolean) =>
    setUsers((u) => (on ? (u.includes(id) ? u : [...u, id]) : u.filter((x) => x !== id)));
  const ownerMissing = mode !== "none" && users.length === 0;

  const submit = async () => {
    const patch: EntryPatch = {
      origin_category: category,
      platform,
      campaign_id: campaignId,
      owner_rule: { mode, user_ids: mode === "fixed" ? users.slice(0, 1) : mode === "round_robin" ? users : [] },
      active,
      ...(isWebhook ? {} : { name: name.trim() }),
      ...(routesToLine ? { pipeline_id: pipelineId } : {}),
    };
    try {
      await onSave(entry.id, patch);
      onClose();
    } catch {
      // the hook shows the error
    }
  };

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry.name}</DialogTitle>
          <DialogDescription>
            {ENTRY_KIND_LABEL[entry.kind]} · o carimbo de quem chega por aqui. UTMs e click IDs do payload valem mais
            quando provam outra coisa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!isWebhook && (
            <div className="space-y-1">
              <Label htmlFor="entry-name">Nome</Label>
              <Input id="entry-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={category ?? NONE} onValueChange={(v) => setCategory(v === NONE ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {ORIGIN_CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Plataforma</Label>
              <Select value={platform ?? NONE} onValueChange={(v) => setPlatform(v === NONE ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Campanha padrão</Label>
              <Select value={campaignId ?? NONE} onValueChange={(v) => setCampaignId(v === NONE ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {campaigns.filter((c) => c.status !== "archived").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Linha do negócio novo</Label>
              {isWebhook ? (
                <p className="flex h-10 items-center text-sm text-muted-foreground">{entry.pipeline_name ?? "Padrão da equipe"} · no webhook</p>
              ) : routesToLine ? (
                <Select value={pipelineId ?? NONE} onValueChange={(v) => setPipelineId(v === NONE ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Padrão da equipe</SelectItem>
                    {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex h-10 items-center text-sm text-muted-foreground">A escolhida no cadastro</p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Quem pega o negócio</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as OwnerRuleMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguém (fica sem responsável)</SelectItem>
                <SelectItem value="fixed">Sempre a mesma pessoa</SelectItem>
                <SelectItem value="round_robin">Rodízio entre pessoas</SelectItem>
              </SelectContent>
            </Select>
            {mode !== "none" && (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {members.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 text-sm">
                      {mode === "fixed" ? (
                        <input type="radio" name="entry-fixed-owner" checked={users[0] === m.id} onChange={() => setUsers([m.id])} />
                      ) : (
                        <Checkbox checked={users.includes(m.id)} onCheckedChange={(v) => toggleUser(m.id, v === true)} />
                      )}
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {mode === "round_robin" && users.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Ordem do rodízio: {users.map((u) => nameOf(u) ?? "—").join(" → ")}</p>
            )}
            {ownerMissing && <p className="text-[11px] text-destructive">Escolha pelo menos uma pessoa.</p>}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="entry-active">Ativa</Label>
            <Switch id="entry-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving || ownerMissing || (!isWebhook && !name.trim())}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
