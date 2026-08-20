import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, Wrench, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, useContract, useRefreshBilling } from "@/hooks/useBilling";
import { useEntitlements } from "@/hooks/useEntitlements";

/**
 * Sprint 8.2 — buy the add-ons, not just credits.
 *
 * Instances are RECURRING: buying one adds a monthly line to the contract, so it
 * appears on the next invoice rather than as a one-off charge somebody has to
 * remember. Builder hours are one-off and billed as an adhoc invoice.
 *
 * The instance count is shown against what is actually connected in AI Studio,
 * because paying for three and connecting one is the kind of mismatch nobody
 * notices until they read a bill.
 */
export function AddonPurchase() {
  const { toast } = useToast();
  const refreshBilling = useRefreshBilling();
  const { data: contractData } = useContract();
  const { entitlements } = useEntitlements();
  const [busy, setBusy] = useState<string | null>(null);
  const [hours, setHours] = useState(1);

  const { data: products } = useQuery({
    queryKey: ["addon-products"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_products")
        .select("id, code, name, list_price, kind, metadata")
        .in("code", ["instance_whatsapp", "builder_hour"])
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: connected } = useQuery({
    queryKey: ["wpp-instance-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("wpp_instances")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const instance = (products ?? []).find((p) => p.code === "instance_whatsapp");
  const builder = (products ?? []).find((p) => p.code === "builder_hour");

  const contractedInstances = (contractData?.items ?? [])
    .filter((i) => i.product?.kind === "instance")
    .reduce((s, i) => s + i.quantity, 0);

  const purchase = async (code: string, quantity: number) => {
    setBusy(code);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-addon", {
        body: { product_code: code, quantity },
      });
      if (error) throw error;
      if (data?.error === "billing_account_incomplete") {
        toast({
          title: "Complete seus dados de cobrança",
          description: "Precisamos do seu CPF ou CNPJ antes de contratar.",
          variant: "destructive",
        });
        return;
      }
      if (data?.error) throw new Error(data.error);

      refreshBilling();
      toast({
        title: code === "instance_whatsapp" ? "Instância contratada" : "Horas contratadas",
        description:
          code === "instance_whatsapp"
            ? "Entrou como item mensal do contrato e aparecerá na próxima fatura."
            : "Geramos uma fatura avulsa para essas horas.",
      });
      if (data?.invoiceUrl) window.open(data.invoiceUrl, "_blank", "noopener");
    } catch (e) {
      toast({
        title: "Não foi possível contratar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adicionais</CardTitle>
        <CardDescription>Amplie o plano sem trocar de tier.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* ── WhatsApp instance ── */}
        {instance && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-green-600" />
                  {instance.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Número conectado adicional. As conversas consomem os créditos de Atendimento do seu plano.
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {contractedInstances} contratada{contractedInstances === 1 ? "" : "s"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      (connected ?? 0) > contractedInstances
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : ""
                    }`}
                  >
                    {connected ?? 0} conectada{(connected ?? 0) === 1 ? "" : "s"}
                  </Badge>
                  <Button asChild size="sm" variant="ghost" className="h-6 text-[11px] px-2">
                    <Link to="/ai-studio/channels">
                      Gerenciar no Studio <ExternalLink className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                </div>
                {(connected ?? 0) > contractedInstances && (
                  <p className="text-[11px] text-amber-600 mt-1.5">
                    Você tem mais instâncias conectadas do que contratadas. Contrate as faltantes para regularizar.
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold">{formatBRL(instance.list_price)}</p>
                <p className="text-[11px] text-muted-foreground">por mês</p>
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={busy !== null}
                  onClick={() => purchase("instance_whatsapp", contractedInstances + 1)}
                >
                  {busy === "instance_whatsapp" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Adicionar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Builder hours ── */}
        {builder && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-violet-600" />
                  Builder Mode
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automações sob medida e integrações (n8n). Horas além do que já vem no seu plano.
                </p>
                {entitlements?.builderHours ? (
                  <Badge variant="outline" className="text-[10px] mt-2">
                    {entitlements.builderHours}h inclusa{entitlements.builderHours === 1 ? "" : "s"} no plano
                    {entitlements.builderRecurrence === "monthly" ? " por mês" : ""}
                  </Badge>
                ) : null}
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold">{formatBRL(builder.list_price)}</p>
                <p className="text-[11px] text-muted-foreground">por hora</p>
                <div className="flex items-center gap-1.5 mt-2 justify-end">
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={hours}
                    onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
                    className="h-8 w-16 text-center"
                  />
                  <Button size="sm" disabled={busy !== null} onClick={() => purchase("builder_hour", hours)}>
                    {busy === "builder_hour" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      `Contratar ${formatBRL(Number(builder.list_price) * hours)}`
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
