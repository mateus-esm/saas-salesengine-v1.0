import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/hooks/useBilling";
import type { ProposalRow } from "./ProposalsTab";

interface ItemDraft {
  id?: string;
  label: string;
  description: string;
  quantity: number;
  unit_price: number;
  period: "monthly" | "one_time";
}

interface Props {
  proposal: ProposalRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUSES = ["rascunho", "enviada", "vista", "aceita", "recusada", "expirada"] as const;

/**
 * Sprint 8 T15 — create and edit a proposal.
 *
 * Line items replace the old fixed item_agente / item_crm / item_lp flags, so
 * any combination can be sold without a code change. The monthly total is
 * computed from the items; `list_monthly_price` is the pre-discount anchor the
 * public page shows as "de X por Y".
 */
export function ProposalDialog({ proposal, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: plans } = useQuery({
    queryKey: ["plan-products"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_products").select("code, name, list_price")
        .eq("kind", "plan").eq("active", true).order("list_price");
      return data ?? [];
    },
  });
  /**
   * Sprint 8.2 — as equipes que já existem.
   *
   * Sem isto, provisionar a proposta de um cliente que já opera aqui criava uma
   * SEGUNDA equipe, vazia, e o contrato ia parar nela. Foi o que aconteceu com
   * Solo Energia, Rema Digital e WI Advogados: a Solo Energia ficou com o
   * contrato ativo numa equipe sem nenhum dos seus 456 leads.
   */
  const { data: equipes } = useQuery({
    queryKey: ["admin-equipes-simples"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("equipes").select("id, nome").order("nome");
      return data ?? [];
    },
  });
  /**
   * Sprint 8.2 — o nicho decide o domínio que o cliente vê no link. Sem
   * escolha aqui, o link cai no domínio da equipe (se `target_equipe_id`) ou
   * no institucional — nunca mais no navegador de quem está montando a
   * proposta.
   */
  const { data: niches } = useQuery({
    queryKey: ["admin-niches-simples"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("niches").select("id, nome, domain").eq("active", true).order("nome");
      return data ?? [];
    },
  });
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    cliente_nome: "", cliente_email: "", cliente_whatsapp: "", cliente_doc: "",
    target_equipe_id: "", niche_id: "",
    setup_price: "0", list_monthly_price: "", term_months: "12",
    valid_until: "", status: "rascunho" as string, notes: "",
    // Sprint 9 — the offer terms
    allow_plan_choice: true,
    recommended_plan_code: "",
    setup_waived: false,
    setup_charge_timing: "on_accept" as "on_accept" | "on_golive",
    trial_days: "15",
  });
  const [items, setItems] = useState<ItemDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (proposal) {
      setForm({
        cliente_nome: proposal.cliente_nome ?? "",
        cliente_email: proposal.cliente_email ?? "",
        cliente_whatsapp: proposal.cliente_whatsapp ?? "",
        cliente_doc: proposal.cliente_doc ?? "",
        target_equipe_id: proposal.target_equipe_id ?? "",
        niche_id: proposal.niche_id ?? "",
        setup_price: String(proposal.setup_price ?? 0),
        list_monthly_price: proposal.list_monthly_price != null ? String(proposal.list_monthly_price) : "",
        term_months: proposal.term_months != null ? String(proposal.term_months) : "",
        valid_until: proposal.valid_until ?? "",
        status: proposal.status,
        notes: "",
        allow_plan_choice: proposal.allow_plan_choice !== false,
        recommended_plan_code: proposal.recommended_plan_code ?? "",
        setup_waived: proposal.setup_waived === true,
        setup_charge_timing: proposal.setup_charge_timing ?? "on_accept",
        trial_days: String(proposal.trial_days ?? 15),
      });
      void loadItems(proposal.id);
    } else {
      setForm({
        cliente_nome: "", cliente_email: "", cliente_whatsapp: "", cliente_doc: "",
        target_equipe_id: "", niche_id: "",
        setup_price: "0", list_monthly_price: "", term_months: "12",
        valid_until: defaultValidity(), status: "rascunho", notes: "",
        allow_plan_choice: true, recommended_plan_code: "", setup_waived: false,
        setup_charge_timing: "on_accept", trial_days: "15",
      });
      setItems([{ label: "Agente de IA", description: "", quantity: 1, unit_price: 0, period: "monthly" }]);
    }
  }, [open, proposal]);

  const loadItems = async (proposalId: string) => {
    const { data } = await supabase
      .from("proposal_items")
      .select("id, label, description, quantity, unit_price, period")
      .eq("proposal_id", proposalId)
      .order("sort_order");
    setItems(
      (data ?? []).map((i) => ({
        id: i.id as string,
        label: (i.label as string) ?? "",
        description: (i.description as string) ?? "",
        quantity: Number(i.quantity ?? 1),
        unit_price: Number(i.unit_price ?? 0),
        period: (i.period as "monthly" | "one_time") ?? "monthly",
      })),
    );
  };

  const monthlyTotal = items
    .filter((i) => i.period === "monthly")
    .reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const updateItem = (idx: number, patch: Partial<ItemDraft>) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const save = async () => {
    if (!form.cliente_nome.trim()) {
      toast({ title: "Informe o nome do cliente", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        cliente_nome: form.cliente_nome.trim(),
        cliente_email: form.cliente_email || null,
        cliente_whatsapp: form.cliente_whatsapp || null,
        cliente_doc: form.cliente_doc || null,
        // Vazio = cliente novo, provisionar cria o ambiente. Preenchido = o
        // contrato é anexado ao ambiente que já existe.
        target_equipe_id: form.target_equipe_id || null,
        // Sem escolha, o link cai no nicho da equipe (se houver) ou no
        // institucional — ver proposal_public_origin().
        niche_id: form.niche_id || null,
        setup_price: Number(form.setup_price) || 0,
        monthly_price: monthlyTotal,
        list_monthly_price: form.list_monthly_price ? Number(form.list_monthly_price) : null,
        term_months: form.term_months ? Number(form.term_months) : null,
        valid_until: form.valid_until || null,
        status: form.status,
        allow_plan_choice: form.allow_plan_choice,
        recommended_plan_code: form.recommended_plan_code || null,
        setup_waived: form.setup_waived,
        setup_charge_timing: form.setup_charge_timing,
        trial_days: Number(form.trial_days) || 0,
      };

      let proposalId = proposal?.id;
      if (proposalId) {
        const { error } = await supabase.from("proposals").update(payload).eq("id", proposalId);
        if (error) throw error;
        // Replace items wholesale: simpler and safer than diffing, and a
        // proposal has a handful of lines, not thousands.
        await supabase.from("proposal_items").delete().eq("proposal_id", proposalId);
      } else {
        const { data, error } = await supabase.from("proposals").insert(payload).select("id").single();
        if (error) throw error;
        proposalId = data.id;
      }

      if (items.length) {
        const { error } = await supabase.from("proposal_items").insert(
          items.map((it, idx) => ({
            proposal_id: proposalId!,
            label: it.label || "Item",
            description: it.description || null,
            quantity: it.quantity || 1,
            unit_price: it.unit_price || 0,
            period: it.period,
            sort_order: idx,
          })),
        );
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["admin-proposals"] });
      toast({ title: proposal ? "Proposta atualizada" : "Proposta criada" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Sprint 8.2 — a prévia do link usa o mesmo resolvedor por nicho que o envio
  // de verdade usa (proposal_public_origin), não o domínio do navegador de
  // quem está com o painel aberto. Cai para o domínio atual enquanto carrega.
  const { data: linkOrigin } = useQuery({
    queryKey: ["proposal-public-origin", proposal?.id],
    enabled: !!proposal?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("proposal_public_origin", { p_proposal_id: proposal!.id });
      return (data as string | null) ?? null;
    },
  });
  const link = proposal ? `${linkOrigin ?? window.location.origin}/proposta/${proposal.codigo}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proposal ? `Proposta ${proposal.codigo}` : "Nova proposta"}</DialogTitle>
          <DialogDescription>
            O valor mensal é a soma dos itens. O cliente vê exatamente estes números.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente" value={form.cliente_nome} onChange={set("cliente_nome")} />
            <Field label="E-mail" value={form.cliente_email} onChange={set("cliente_email")} type="email" />
            <Field label="WhatsApp" value={form.cliente_whatsapp} onChange={set("cliente_whatsapp")} />
            <Field label="CPF / CNPJ" value={form.cliente_doc} onChange={set("cliente_doc")} />
          </div>

          {/* Cliente novo ou cliente que já está aqui. */}
          <div className="space-y-1.5">
            <Label htmlFor="target-equipe" className="text-xs">Ambiente</Label>
            <Select
              value={form.target_equipe_id || "novo"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, target_equipe_id: v === "novo" ? "" : v }))}
            >
              <SelectTrigger id="target-equipe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="novo">Criar um ambiente novo</SelectItem>
                {(equipes ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    Usar o ambiente de {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {form.target_equipe_id
                ? "O contrato será anexado a esse ambiente. Nenhuma equipe nova é criada, e os dados existentes ficam intactos."
                : "Para um cliente que já usa o software, escolha o ambiente dele — senão o provisionamento cria uma equipe duplicada e vazia."}
            </p>
          </div>

          {/* Sprint 8.2 — o link que o cliente recebe abre neste domínio. Sem
              escolha, cai no nicho da equipe (se anexando a uma que já existe)
              ou no institucional rev.soloventures.com.br. */}
          <div className="space-y-1.5">
            <Label htmlFor="niche" className="text-xs">Nicho / marca do link</Label>
            <Select
              value={form.niche_id || "__default__"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, niche_id: v === "__default__" ? "" : v }))}
            >
              <SelectTrigger id="niche">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  {form.target_equipe_id ? "Usar o nicho do ambiente escolhido acima" : "Padrão institucional (Solo Rev)"}
                </SelectItem>
                {(niches ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.nome} · {n.domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Items ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Itens</Label>
              <Button
                size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setItems((a) => [...a, { label: "", description: "", quantity: 1, unit_price: 0, period: "monthly" }])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
              </Button>
            </div>

            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end border border-border rounded-md p-2.5">
                <div className="col-span-5 space-y-1">
                  <Label className="text-[10px]">Descrição</Label>
                  <Input value={it.label} onChange={(e) => updateItem(idx, { label: e.target.value })} className="h-8" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px]">Qtd</Label>
                  <Input
                    type="number" min={1} value={it.quantity} className="h-8"
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px]">Valor</Label>
                  <Input
                    type="number" min={0} step="0.01" value={it.unit_price} className="h-8"
                    onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px]">Período</Label>
                  <Select value={it.period} onValueChange={(v) => updateItem(idx, { period: v as ItemDraft["period"] })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="one_time">Único</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0"
                    onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex justify-between text-sm px-1 pt-1">
              <span className="text-muted-foreground">Mensalidade calculada</span>
              <span className="font-bold">{formatBRL(monthlyTotal)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {!form.setup_waived && (
              <Field label="Setup (R$)" value={form.setup_price} onChange={set("setup_price")} type="number" />
            )}
            <Field label="De (sem desconto)" value={form.list_monthly_price} onChange={set("list_monthly_price")} type="number" />
            <Field label="Prazo (meses)" value={form.term_months} onChange={set("term_months")} type="number" />
            <Field label="Válida até" value={form.valid_until} onChange={set("valid_until")} type="date" />
          </div>

          {/* Sprint 9 - offer terms. These decide how the public page behaves
              and how provisioning bills, so they live with the proposal. */}
          <div className="rounded-lg border border-border p-3.5 space-y-3">
            <p className="text-xs font-semibold">Condicoes da oferta</p>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="pc" className="text-xs cursor-pointer">Cliente escolhe o plano</Label>
                <p className="text-[10px] text-muted-foreground">
                  A pagina mostra os 3 tiers e ele decide. Desligado, vale so o valor fixo acima.
                </p>
              </div>
              <Switch
                id="pc"
                checked={form.allow_plan_choice}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_plan_choice: v }))}
              />
            </div>

            {form.allow_plan_choice && (
              <div className="space-y-1.5">
                <Label className="text-xs">Plano recomendado (destacado)</Label>
                <Select
                  value={form.recommended_plan_code || "__none__"}
                  onValueChange={(v) => setForm((f) => ({ ...f, recommended_plan_code: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {(plans ?? []).map((p) => (
                      <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="sw" className="text-xs cursor-pointer">
                  Sem cobranca de implantacao
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {form.setup_waived
                    ? "Nenhuma fatura de implantacao sera emitida. Use tanto para cortesia (voce absorve o setup) quanto para um negocio que nao tem implantacao nenhuma."
                    : "Cortesia ou negocio sem implantacao. Combine cortesia com fidelidade: troque seu risco por compromisso, nao por esperanca."}
                </p>
              </div>
              <Switch
                id="sw"
                checked={form.setup_waived}
                // Zera o valor junto: deixar "R$ 1.000" num campo que nao vai
                // ser cobrado e a proposta dizendo duas coisas diferentes, e a
                // primeira pessoa a reler nao sabe qual vale.
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, setup_waived: v, setup_price: v ? "0" : f.setup_price }))}
              />
            </div>

            {!form.setup_waived && (
              <div className="space-y-1.5">
                <Label className="text-xs">Quando cobrar a implantacao</Label>
                <Select
                  value={form.setup_charge_timing}
                  onValueChange={(v) => setForm((f) => ({ ...f, setup_charge_timing: v as "on_accept" | "on_golive" }))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_accept">No aceite, antes de comecar o trabalho</SelectItem>
                    <SelectItem value="on_golive">Na entrega, voce faz o trabalho primeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Dias de teste gratis (a partir do go-live)</Label>
              <Input
                type="number" min={0} max={60} className="h-8"
                value={form.trial_days}
                onChange={(e) => setForm((f) => ({ ...f, trial_days: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">
                0 = sem teste. O periodo comeca quando o ambiente entra no ar, nunca no aceite.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              &ldquo;Vista&rdquo; e &ldquo;Aceita&rdquo; são gravados pela própria página pública — não é preciso mudar à mão.
            </p>
          </div>

          {link && (
            <div className="space-y-1.5">
              <Label className="text-xs">Link da proposta</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-[11px] bg-muted rounded-md px-3 py-2 truncate font-mono">{link}</code>
                <Button
                  size="sm" variant="outline"
                  onClick={() => { navigator.clipboard.writeText(link); toast({ title: "Link copiado" }); }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {proposal ? "Salvar" : "Criar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; type?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} />
    </div>
  );
}

/** Proposals default to 15 days' validity — long enough to decide, short enough to close. */
function defaultValidity(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().split("T")[0];
}
