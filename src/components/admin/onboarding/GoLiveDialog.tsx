import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Rocket } from "lucide-react";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/hooks/useBilling";
import { useGoLive, type OnboardingRow } from "@/hooks/useOnboarding";
import { isValidBrDoc, maskCNPJ, maskCPF, onlyDigits } from "@/lib/br-doc";

interface Props {
  card: OnboardingRow | null;
  onClose: () => void;
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}

const dateBR = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

/**
 * Colocar no ar.
 *
 * Este diálogo existe porque o sistema fazia o contrário: colocava no ar e só
 * depois descobria que a cobrança não sairia. A FAT-2026-000018 da Rema (R$700)
 * está aberta sem nenhuma cobrança no Asaas porque o CNPJ nunca foi exigido, e
 * ninguém percebeu até alguém ir conferir o extrato.
 *
 * Aqui o que falta aparece ANTES, com o campo à mão. Não é um aviso: o botão
 * fica desabilitado enquanto o documento não for válido.
 */
export function GoLiveDialog({ card, onClose }: Props) {
  const { toast } = useToast();
  const goLive = useGoLive();
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const open = !!card;

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["golive-preview", card?.equipe_id],
    enabled: open && !!card?.equipe_id,
    queryFn: async () => {
      const [account, contract, invoice, items, proposal] = await Promise.all([
        supabase.from("billing_accounts")
          .select("doc_number, billing_email, legal_name")
          .eq("equipe_id", card!.equipe_id!).maybeSingle(),
        supabase.from("contracts")
          .select("id, status, trial_ends_at")
          .eq("equipe_id", card!.equipe_id!)
          .in("status", ["draft", "onboarding"]).maybeSingle(),
        supabase.from("invoices")
          .select("id, number, total, due_date, asaas_payment_id, status")
          .eq("equipe_id", card!.equipe_id!).eq("kind", "setup")
          .neq("status", "void").maybeSingle(),
        supabase.from("contract_items")
          .select("quantity, unit_price, period, contract_id")
          .eq("contract_id", card!.contract_id ?? ""),
        card?.proposal_id
          ? supabase.from("proposals")
              .select("trial_days, setup_charge_timing, chosen_plan_code")
              .eq("id", card.proposal_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const monthly = (items.data ?? [])
        .filter((i) => i.period === "monthly")
        .reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);

      return {
        account: account.data,
        contract: contract.data,
        invoice: invoice.data,
        monthly,
        proposal: proposal.data as
          | { trial_days: number; setup_charge_timing: string; chosen_plan_code: string | null }
          | null,
      };
    },
  });

  // Prefill com o que já existe: o campo só precisa ser digitado quando falta.
  useEffect(() => {
    if (!open) { setDoc(""); setEmail(""); return; }
    setDoc(preview?.account?.doc_number ?? "");
    setEmail(preview?.account?.billing_email ?? "");
  }, [open, preview?.account?.doc_number, preview?.account?.billing_email]);

  const docOk = isValidBrDoc(doc);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const precisaSalvar =
    doc !== (preview?.account?.doc_number ?? "") ||
    email.trim() !== (preview?.account?.billing_email ?? "");

  const trialDays = preview?.proposal?.trial_days ?? 15;
  const trialEnd = new Date(Date.now() + trialDays * 86_400_000);
  const cobraAgora = !!preview?.invoice && !preview.invoice.asaas_payment_id;

  const confirm = async () => {
    if (!card) return;
    setSaving(true);
    try {
      // Grava o que foi corrigido ANTES de chamar o go-live: a edge function
      // recusa com 409 se a conta não estiver pronta, e é a mesma checagem.
      if (precisaSalvar && card.equipe_id) {
        const digits = onlyDigits(doc);
        const { error } = await supabase.from("billing_accounts").update({
          doc_number: digits,
          doc_type: digits.length === 14 ? "CNPJ" : "CPF",
          billing_email: email.trim(),
        }).eq("equipe_id", card.equipe_id);
        if (error) throw error;
        await refetch();
      }

      const res = await goLive.mutateAsync({
        contract_id: card.contract_id ?? undefined,
        onboarding_id: card.id,
      });

      if (res.error === "billing_incomplete") {
        toast({
          title: "Faltam dados de cobrança",
          description: `Preencha: ${(res.missing ?? []).join(", ")}`,
          variant: "destructive",
        });
        return;
      }
      if (res.error) throw new Error(res.error);

      toast({
        title: res.already_live ? "Já estava no ar" : "No ar! 🚀",
        description: res.charged
          ? "Trial iniciado e cobrança da implantação emitida."
          : (res.warnings ?? []).length
            ? `Trial iniciado. Atenção: ${res.warnings!.join("; ")}`
            : "Trial iniciado e o cliente foi avisado.",
      });
      onClose();
    } catch (e) {
      toast({
        title: "Não foi possível colocar no ar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Colocar {card?.cliente_nome} no ar</DialogTitle>
          <DialogDescription>
            É aqui que o trial começa e a cobrança da implantação é emitida. Confira antes.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-1">
            <Row label="Ambiente" value={preview?.account?.legal_name ?? card?.cliente_nome} />
            <Row
              label="Mensalidade"
              value={preview?.monthly ? `${formatBRL(preview.monthly)}/mês` : "—"}
            />
            <Row
              label="Trial"
              value={trialDays > 0
                ? `${trialDays} dias · até ${trialEnd.toLocaleDateString("pt-BR")}`
                : "sem trial"}
            />

            <Separator className="my-2" />

            {preview?.invoice ? (
              <>
                <Row
                  label="Implantação"
                  value={`${formatBRL(Number(preview.invoice.total))} · ${preview.invoice.number}`}
                />
                <Row label="Vence em" value={dateBR(preview.invoice.due_date)} />
                <Row
                  label="Cobrança"
                  muted={!cobraAgora}
                  value={cobraAgora ? "será emitida agora" : "já emitida"}
                />
              </>
            ) : (
              <Row label="Implantação" muted value="sem fatura (isenta)" />
            )}

            {/* O que impede a cobrança de existir, com o campo à mão. */}
            {(!docOk || !emailOk) && (
              <div className="mt-3 space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Sem estes dados o Asaas não abre a cobrança: a fatura fica aberta e o
                  dinheiro nunca é pedido.
                </p>

                {!docOk && (
                  <div className="space-y-1">
                    <Label htmlFor="golive-doc" className="text-xs">CPF ou CNPJ</Label>
                    <Input
                      id="golive-doc"
                      value={onlyDigits(doc).length > 11 ? maskCNPJ(doc) : maskCPF(doc)}
                      onChange={(e) => setDoc(onlyDigits(e.target.value).slice(0, 14))}
                      placeholder="00.000.000/0000-00"
                      className="h-8"
                    />
                  </div>
                )}

                {!emailOk && (
                  <div className="space-y-1">
                    <Label htmlFor="golive-email" className="text-xs">E-mail de cobrança</Label>
                    <Input
                      id="golive-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="financeiro@cliente.com.br"
                      className="h-8"
                    />
                  </div>
                )}
              </div>
            )}

            {docOk && emailOk && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dados de cobrança completos.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving || isLoading || !docOk || !emailOk}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            Colocar no ar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
