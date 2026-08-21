import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, QrCode, CreditCard, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useCreditPacks, formatBRL, formatCredits, useRefreshBilling, type CreditPool } from "@/hooks/useBilling";
import { PixPaymentDialog } from "@/components/billing/PixPaymentDialog";

const STEP = 500;
const MIN = 500;
const MAX = 50_000;

/**
 * Sprint 8.2 — buy any amount, not just a fixed pack.
 *
 * The customer types or drags the number of credits and the price updates live.
 * The RATE comes from the catalog, not from this file: the browser never states
 * what it is paying. asaas-buy-credits recomputes the price server-side from the
 * same rate and ignores anything the client sends about money.
 */
export function CreditPurchase() {
  const { data: packs } = useCreditPacks();
  const [pool, setPool] = useState<CreditPool>("whatsapp");
  const [credits, setCredits] = useState<number>(2500);
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<{ invoiceId: string; amount: number; qr?: string; copy?: string } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const refreshBilling = useRefreshBilling();

  // Derived from the smallest pack so the displayed price can never drift from
  // what the server will actually charge.
  const rate = useMemo(() => {
    const ref = (packs ?? []).find((p) => p.credits_included > 0);
    return ref ? Number(ref.list_price) / ref.credits_included : 0.08;
  }, [packs]);

  const price = useMemo(() => Math.round(credits * rate * 100) / 100, [credits, rate]);

  const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n / STEP) * STEP));

  const buy = async () => {
    setBusy(true);
    try {
      // Only the QUANTITY and the pool travel. Never the price.
      const { data, error } = await supabase.functions.invoke("asaas-buy-credits", {
        body: { credits, pool, paymentMethod: method },
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
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recarregar créditos</CardTitle>
        <CardDescription>
          Escolha a quantidade. Créditos avulsos não expiram e são consumidos só depois dos créditos do plano.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Which wallet ── */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Para qual carteira?</Label>
          <RadioGroup value={pool} onValueChange={(v) => setPool(v as CreditPool)} className="grid gap-2 sm:grid-cols-2">
            {(["whatsapp", "copilot"] as const).map((p) => {
              const Icon = p === "whatsapp" ? MessageCircle : Sparkles;
              return (
                <label
                  key={p}
                  htmlFor={`cp-${p}`}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                    pool === p ? "border-primary bg-primary/[0.04]" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={p} id={`cp-${p}`} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      {p === "whatsapp" ? "Atendimento" : "Copiloto"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p === "whatsapp"
                        ? "O agente responde seus clientes no WhatsApp"
                        : "Ações automáticas no CRM"}
                    </p>
                  </div>
                </label>
              );
            })}
          </RadioGroup>
        </div>

        {/* ── How many ── */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="qtd" className="text-xs font-medium">Quantidade de créditos</Label>
              <Input
                id="qtd"
                type="number"
                min={MIN}
                max={MAX}
                step={STEP}
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value) || MIN)}
                onBlur={(e) => setCredits(clamp(Number(e.target.value) || MIN))}
                className="text-lg font-semibold"
              />
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-muted-foreground">Valor</p>
              <p className="text-2xl font-bold tracking-tight">{formatBRL(price)}</p>
            </div>
          </div>

          <Slider
            value={[Math.min(MAX, Math.max(MIN, credits))]}
            min={MIN}
            max={20_000}
            step={STEP}
            onValueChange={([v]) => setCredits(v)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatCredits(MIN)}</span>
            <span>{formatCredits(20_000)}</span>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {[1000, 2500, 5000, 10000, 15000].map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={credits === n ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setCredits(n)}
              >
                {formatCredits(n)}
              </Button>
            ))}
          </div>
        </div>

        {/* ── How to pay ── */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Forma de pagamento</Label>
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as typeof method)} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="PIX" id="pm-pix" />
              <Label htmlFor="pm-pix" className="flex items-center gap-1.5 cursor-pointer text-sm">
                <QrCode className="w-3.5 h-3.5" /> PIX
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="CREDIT_CARD" id="pm-card" />
              <Label htmlFor="pm-card" className="flex items-center gap-1.5 cursor-pointer text-sm">
                <CreditCard className="w-3.5 h-3.5" /> Cartão / Boleto
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Button className="w-full" size="lg" disabled={busy} onClick={buy}>
          {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Comprar {formatCredits(credits)} créditos por {formatBRL(price)}
        </Button>
      </CardContent>

      <PixPaymentDialog
        open={!!pix}
        onOpenChange={(o) => !o && setPix(null)}
        invoiceId={pix?.invoiceId ?? null}
        amount={pix?.amount ?? 0}
        qrCodeBase64={pix?.qr}
        copyPaste={pix?.copy}
      />
    </Card>
  );
}
