import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBillingAccount, useCreditPacks, useEquipeId, formatBRL, formatCredits } from "@/hooks/useBilling";

/**
 * Sprint 8 T18 — auto top-up.
 *
 * HONESTY NOTE, and the reason the copy below reads the way it does: automatic
 * recharge only truly works with a saved card. With PIX we can generate the
 * charge and warn you, but a human still has to pay it. Promising "recharges
 * itself" to a PIX customer would be exactly the kind of broken promise this
 * sprint exists to eliminate, so the UI states the difference plainly.
 */
export function AutoRecharge() {
  const equipeId = useEquipeId();
  const { data: account, refetch } = useBillingAccount();
  const { data: packs } = useCreditPacks();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState("500");
  const [productId, setProductId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    setEnabled(Boolean(account.auto_recharge_enabled));
    setThreshold(String(account.auto_recharge_threshold ?? 500));
    setProductId((account.auto_recharge_product_id as string) ?? "");
  }, [account]);

  const save = async () => {
    if (!equipeId) return;
    setSaving(true);
    try {
      // Sprint 8.2 — pela função, não por update direto.
      //
      // `billing_accounts` só tem política de SELECT no RLS. O update que
      // estava aqui não casava com política nenhuma: afetava ZERO linhas, o
      // PostgREST devolvia 200, e o toast dizia "Preferência salva". A recarga
      // automática nunca chegou a ser ligada por ninguém — o cliente marcava,
      // lia que salvou, e o saldo acabava assim mesmo.
      const { error } = await supabase.rpc("save_auto_recharge", {
        p_enabled: enabled,
        p_threshold: Number(threshold) || 0,
        p_product_id: productId || null,
      });
      if (error) throw error;
      await refetch();
      toast({ title: "Preferência salva" });
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

  const selected = (packs ?? []).find((p) => p.id === productId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recarga automática</CardTitle>
        <CardDescription>Evite que o agente pare por falta de crédito.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="auto-recharge" className="cursor-pointer text-sm font-medium">
            Ativar recarga automática
          </Label>
          <Switch id="auto-recharge" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="threshold" className="text-xs">Quando o saldo ficar abaixo de</Label>
              <Input
                id="threshold"
                type="number"
                min={0}
                step={100}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Comprar o pacote</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Escolha um pacote" /></SelectTrigger>
                <SelectContent>
                  {(packs ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatCredits(p.credits_included)} — {formatBRL(p.list_price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {enabled && (
          <div className="rounded-md border border-blue-500/25 bg-blue-500/8 px-3 py-2.5 flex gap-2.5">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground mb-0.5">Como funciona por forma de pagamento</p>
              <p>
                <span className="font-medium">Cartão salvo:</span> a recarga é cobrada automaticamente e os
                créditos entram sem você fazer nada.
              </p>
              <p className="mt-1">
                <span className="font-medium">PIX:</span> geramos a cobrança e avisamos você — mas o pagamento
                ainda precisa ser feito por alguém. Não é automático de ponta a ponta.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-xs text-muted-foreground">
            {enabled && selected
              ? `Ao ficar abaixo de ${formatCredits(Number(threshold))} créditos, cobraremos ${formatBRL(selected.list_price)}.`
              : "Você receberá avisos em 80%, 95% e ao zerar o saldo, independentemente desta opção."}
          </p>
          <Button size="sm" onClick={save} disabled={saving || (enabled && !productId)}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
