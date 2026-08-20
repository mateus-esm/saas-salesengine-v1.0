import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Loader2, MessageCircle, Sparkles, Users, Wrench, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useContract, formatBRL, formatCredits, formatDate, useRefreshBilling } from "@/hooks/useBilling";
import { AddonPurchase } from "@/components/billing/AddonPurchase";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft:     { label: "Aguardando pagamento", className: "bg-muted text-muted-foreground" },
  active:    { label: "Ativo",                className: "bg-green-500/10 text-green-700 dark:text-green-300" },
  past_due:  { label: "Pagamento em atraso",  className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  suspended: { label: "Somente leitura",      className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  cancelled: { label: "Cancelado",            className: "bg-muted text-muted-foreground" },
};

interface PlanProduct {
  id: string;
  code: string;
  name: string;
  list_price: number;
  credits_whatsapp: number;
  credits_copilot: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Sprint 8.2 — "Contrato" became "Plano".
 *
 * The old page only showed what you already had, which answers the wrong
 * question: someone opening it is usually deciding whether to move. It now shows
 * the three tiers side by side with the current one marked, so upgrading is a
 * click rather than a support conversation.
 */
export default function PlanPage() {
  const { data: contractData, isLoading } = useContract();
  const { toast } = useToast();
  const refreshBilling = useRefreshBilling();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: plans } = useQuery({
    queryKey: ["plan-products"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlanProduct[]> => {
      const { data, error } = await supabase
        .from("billing_products")
        .select("id, code, name, list_price, credits_whatsapp, credits_copilot, metadata")
        .eq("kind", "plan").eq("active", true)
        .order("list_price", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanProduct[];
    },
  });

  const contract = contractData?.contract;
  const items = contractData?.items ?? [];
  const currentPlan = items.find((i) => i.product?.kind === "plan");
  const currentCode = currentPlan?.product?.code;
  const monthly = contractData?.monthlyTotal ?? 0;

  const subscribe = async (plan: PlanProduct) => {
    setBusy(plan.code);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-subscribe", {
        body: { product_id: plan.id, paymentMethod: "UNDEFINED" },
      });
      if (error) throw error;
      if (data?.error === "billing_account_incomplete") {
        toast({
          title: "Complete seus dados de cobrança",
          description: "Precisamos do seu CPF ou CNPJ antes de assinar.",
          variant: "destructive",
        });
        return;
      }
      if (data?.error === "contract_already_active") {
        toast({
          title: "Você já tem um plano ativo",
          description: "Fale com a gente para trocar de plano sem perder o período pago.",
        });
        return;
      }
      if (data?.error) throw new Error(data.error);

      refreshBilling();
      toast({ title: "Fatura gerada", description: "O plano é ativado assim que o pagamento for confirmado." });
      if (data?.invoiceUrl) window.open(data.invoiceUrl, "_blank", "noopener");
    } catch (e) {
      toast({
        title: "Não foi possível assinar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const status = STATUS_LABEL[contract?.status ?? "none"] ?? null;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Plano</h1>
        {status && (
          <Badge variant="outline" className={`text-[11px] ${status.className}`}>{status.label}</Badge>
        )}
      </div>

      {/* ── Current ── */}
      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : contract && currentPlan ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Plano atual</p>
                <p className="text-2xl font-bold tracking-tight">
                  {currentPlan.product?.name ?? "Plano"}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatBRL(monthly)}/mês · renova {formatDate(contract.current_period_end)}
                  {contract.term_months ? ` · ${contract.term_months} meses` : " · sem fidelidade"}
                </p>
              </div>
              <div className="text-sm text-right space-y-0.5">
                {items.filter((i) => i.product?.kind !== "plan").map((i) => (
                  <p key={i.id} className="text-muted-foreground">
                    {i.quantity > 1 && `${i.quantity}× `}
                    {i.product?.name ?? "Adicional"} — {formatBRL(i.unit_price * i.quantity)}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm font-medium">Você ainda não tem um plano ativo</p>
            <p className="text-xs text-muted-foreground mt-1">
              Escolha um abaixo. A cobrança só começa depois que o pagamento for confirmado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── The three tiers ── */}
      <div>
        <h2 className="text-base font-semibold mb-1">Planos disponíveis</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Todos incluem as duas carteiras de crédito. Quanto maior o plano, mais barato fica o crédito.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          {(plans ?? []).map((plan) => {
            const meta = (plan.metadata ?? {}) as Record<string, number | string>;
            const isCurrent = plan.code === currentCode;
            const currentPrice = currentPlan?.product?.list_price ?? 0;
            const isUpgrade = !isCurrent && currentCode && Number(plan.list_price) > Number(currentPrice);
            const isDowngrade = !isCurrent && currentCode && Number(plan.list_price) < Number(currentPrice);
            const total = plan.credits_whatsapp + plan.credits_copilot;
            const perCredit = total > 0 ? Number(plan.list_price) / total : 0;

            return (
              <Card key={plan.id} className={cn(isCurrent && "border-primary ring-1 ring-primary/20")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent && <Badge className="text-[10px]">Atual</Badge>}
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{formatBRL(plan.list_price)}</p>
                    <CardDescription className="text-[11px]">
                      por mês · {formatBRL(perCredit)} por crédito
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-xs">
                    <Feature icon={MessageCircle}>
                      <strong>{formatCredits(plan.credits_whatsapp)}</strong> créditos de Atendimento
                    </Feature>
                    <Feature icon={Sparkles}>
                      <strong>{formatCredits(plan.credits_copilot)}</strong> créditos de Copiloto
                    </Feature>
                    <Feature icon={Users}>
                      até <strong>{String(meta.seat_limit ?? "—")}</strong> usuários
                    </Feature>
                    <Feature icon={Wrench}>
                      <strong>{String(meta.builder_hours ?? 0)}h</strong> de Builder Mode
                      {meta.builder_recurrence === "monthly" ? " por mês" : " na implantação"}
                    </Feature>
                  </ul>

                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      <Check className="w-3.5 h-3.5 mr-1.5" /> Seu plano
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={isUpgrade ? "default" : "outline"}
                      disabled={busy !== null}
                      onClick={() => subscribe(plan)}
                    >
                      {busy === plan.code ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isUpgrade ? (
                        <>Fazer upgrade <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></>
                      ) : isDowngrade ? (
                        <>Fazer downgrade <ArrowDownRight className="w-3.5 h-3.5 ml-1" /></>
                      ) : (
                        "Assinar"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          Créditos do plano expiram no fim do período. Créditos avulsos comprados por você nunca expiram
          e só são consumidos depois que os do plano acabam.
        </p>
      </div>

      <AddonPurchase />
    </div>
  );
}

function Feature({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
