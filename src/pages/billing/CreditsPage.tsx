import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, CreditCard, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  useCreditBalance, useCreditPacks, useCreditLedger,
  formatBRL, formatCredits, formatDate, useRefreshBilling,
} from "@/hooks/useBilling";
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
  const [buying, setBuying] = useState<string | null>(null);
  const [pix, setPix] = useState<{ invoiceId: string; amount: number; qr?: string; copy?: string } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const refreshBilling = useRefreshBilling();

  const granted = credits?.grantTotal ?? 0;
  const pct = granted > 0 ? Math.min(100, Math.round(((credits?.expiring ?? 0) / granted) * 100)) : 0;

  const buy = async (productId: string, price: number) => {
    setBuying(productId);
    try {
      // Only the product id travels. Price and credits come from the catalog
      // server-side — the browser never states what it is paying or receiving.
      const { data, error } = await supabase.functions.invoke("asaas-buy-credits", {
        body: { product_id: productId, paymentMethod: method },
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

      {/* ── Balance ── */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-bold tracking-tight">{formatCredits(credits?.total)}</p>
                <p className="text-sm text-muted-foreground mt-1">créditos disponíveis</p>
              </div>
              <div className="text-sm space-y-0.5 sm:text-right">
                <p>
                  <span className="font-semibold">{formatCredits(credits?.expiring)}</span>{" "}
                  <span className="text-muted-foreground">
                    do plano{credits?.grantExpiresAt && ` — expiram ${formatDate(credits.grantExpiresAt)}`}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">{formatCredits(credits?.permanent)}</span>{" "}
                  <span className="text-muted-foreground">avulsos — não expiram</span>
                </p>
              </div>
            </div>
          )}
          {granted > 0 && <Progress value={pct} className="mt-4 h-1.5" />}
        </CardContent>
      </Card>

      {/* ── Packs ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recarregar</CardTitle>
          <CardDescription>
            Créditos avulsos não expiram e são consumidos só depois dos créditos do plano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      <p className="text-sm">{ENTRY_LABEL[e.entry_type] ?? e.entry_type}</p>
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
        Sem créditos, as ações de IA param. O chat com sua equipe continua funcionando normalmente.
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
