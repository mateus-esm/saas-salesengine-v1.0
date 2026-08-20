import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, CreditCard, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  useCreditBalance, useCreditPacks, useCreditLedger,
  formatBRL, formatCredits, formatDate, useRefreshBilling, type CreditPool,
} from "@/hooks/useBilling";
import { PoolBalanceCard } from "@/components/billing/PoolBalanceCard";
import { PixPaymentDialog } from "@/components/billing/PixPaymentDialog";
import { AutoRecharge } from "@/components/billing/AutoRecharge";

const ENTRY_LABEL: Record<string, string> = {
  grant: "Créditos do plano",
  topup: "Recarga",
  debit: "Consumo de IA",
  refund: "Estorno",
  expiry: "Expiração do plano",
  adjustment: "Ajuste de conciliação",
};

/** Sprint 8 T13 — balance, packs from the catalog, and an auditable statement. */
export default function CreditsPage() {
  const { data: credits, isLoading } = useCreditBalance();
  const { data: packs } = useCreditPacks();
  const { data: ledger } = useCreditLedger(30);
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  // Sprint 8.1: the buyer picks which pool to fill. Defaults to attendance —
  // it is the one whose exhaustion stops the customer's own conversations.
  const [pool, setPool] = useState<CreditPool>("whatsapp");
  const [buying, setBuying] = useState<string | null>(null);
  const [pix, setPix] = useState<{ invoiceId: string; amount: number; qr?: string; copy?: string } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const refreshBilling = useRefreshBilling();

  const buy = async (productId: string, price: number) => {
    setBuying(productId);
    try {
      // Only the product id travels. Price and credits come from the catalog
      // server-side — the browser never states what it is paying or receiving.
      const { data, error } = await supabase.functions.invoke("asaas-buy-credits", {
        body: { product_id: productId, paymentMethod: method, pool },
      });
      if (error) throw error;
      if (data?.error === "billing_account_incomplete") {
        toast({
          title: "Complete seus dados de cobrança",
          description: "Precisamos do seu CPF ou CNPJ para emitir a fatura.",
          variant: "destructive",
        });
        navigate("/billing/dados");
        return;
      }
      if (data?.error) throw new Error(data.error);

      refreshBilling();
      if (method === "PIX" && data?.pixCopyPaste) {
        setPix({ invoiceId: data.invoiceId, amount: data.amount ?? price, qr: data.pixQrCode, copy: data.pixCopyPaste });
      } else if (data?.invoiceUrl) {
        window.open(data.invoiceUrl, "_blank", "noopener");
      }
    } catch (e) {
      toast({
        title: "Não foi possível gerar a cobrança",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Créditos</h1>
        <p className="text-sm text-muted-foreground mt-1">Saldo, recarga e extrato.</p>
      </div>

      {/* ── Balance: two independent pools ── */}
      {isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <PoolBalanceCard pool="whatsapp" balance={credits!.whatsapp} expiresAt={credits?.grantExpiresAt} />
          <PoolBalanceCard pool="copilot" balance={credits!.copilot} expiresAt={credits?.grantExpiresAt} />
        </div>
      )}

      {/* ── Packs ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recarregar</CardTitle>
          <CardDescription>
            Créditos avulsos não expiram e são consumidos só depois dos créditos do plano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Para qual carteira?</Label>
            <RadioGroup value={pool} onValueChange={(v) => setPool(v as CreditPool)} className="flex gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="whatsapp" id="p-wa" />
                <Label htmlFor="p-wa" className="cursor-pointer text-sm">
                  Atendimento <span className="text-muted-foreground">(agente responde clientes)</span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="copilot" id="p-cp" />
                <Label htmlFor="p-cp" className="cursor-pointer text-sm">
                  Copiloto <span className="text-muted-foreground">(ações no CRM)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <RadioGroup value={method} onValueChange={(v) => setMethod(v as typeof method)} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="PIX" id="m-pix" />
              <Label htmlFor="m-pix" className="flex items-center gap-1.5 cursor-pointer text-sm">
                <QrCode className="w-3.5 h-3.5" /> PIX
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="CREDIT_CARD" id="m-card" />
              <Label htmlFor="m-card" className="flex items-center gap-1.5 cursor-pointer text-sm">
                <CreditCard className="w-3.5 h-3.5" /> Cartão / Boleto
              </Label>
            </div>
          </RadioGroup>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(packs ?? []).map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-4 flex flex-col">
                <p className="text-lg font-bold">{formatCredits(p.credits_included)}</p>
                <p className="text-xs text-muted-foreground">créditos</p>
                <p className="text-xl font-semibold mt-2">{formatBRL(p.list_price)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatBRL(Number(p.list_price) / Math.max(1, p.credits_included))} por crédito
                </p>
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  disabled={buying !== null}
                  onClick={() => buy(p.id, Number(p.list_price))}
                >
                  {buying === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Comprar"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AutoRecharge />

      {/* ── Statement ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extrato</CardTitle>
          <CardDescription>Todo crédito e todo débito, com origem.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!ledger?.length ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Nenhum lançamento ainda.</p>
          ) : (
            <div className="divide-y divide-border">
              {ledger.map((e) => {
                const credits = Number(e.credits ?? 0);
                return (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm">
                        {ENTRY_LABEL[e.entry_type] ?? e.entry_type}
                        <span className="text-muted-foreground">
                          {" · "}{(e as { pool?: string }).pool === "copilot" ? "Copiloto" : "Atendimento"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.created_at)}</p>
                    </div>
                    <span
                      className={
                        credits >= 0
                          ? "text-sm font-semibold text-green-600 tabular-nums"
                          : "text-sm font-semibold text-muted-foreground tabular-nums"
                      }
                    >
                      {credits >= 0 ? "+" : "−"}
                      {formatCredits(Math.abs(credits))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Zap className="w-3 h-3" />
        As carteiras são independentes: ficar sem créditos de Atendimento pausa o agente,
        mas não afeta o Copiloto — e vice-versa. O chat com sua equipe nunca consome créditos.
      </p>

      <PixPaymentDialog
        open={!!pix}
        onOpenChange={(o) => !o && setPix(null)}
        invoiceId={pix?.invoiceId ?? null}
        amount={pix?.amount ?? 0}
        qrCodeBase64={pix?.qr}
        copyPaste={pix?.copy}
      />
    </div>
  );
}
