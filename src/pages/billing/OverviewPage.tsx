import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CheckCircle2, CreditCard, Zap } from "lucide-react";
import {
  useContract, useCreditBalance, useOpenInvoice, useInvoices,
  formatBRL, formatCredits, formatDate, daysUntil,
} from "@/hooks/useBilling";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { PoolBalanceCard } from "@/components/billing/PoolBalanceCard";

/**
 * Sprint 8 T13 — the overview.
 *
 * Three cards, ONE hero number each. Two numbers of equal weight in one card
 * make the reader choose what matters; that choice is the designer's job.
 */
export default function OverviewPage() {
  const { data: contractData, isLoading: contractLoading } = useContract();
  const { data: credits, isLoading: creditsLoading } = useCreditBalance();
  const { data: openInvoice, isLoading: invoiceLoading } = useOpenInvoice();
  const { data: invoices } = useInvoices();

  const monthly = contractData?.monthlyTotal ?? 0;
  const contract = contractData?.contract;

  const daysToRenew = daysUntil(contract?.current_period_end);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          O que você tem, quanto usou e o que está em aberto.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* ── Plan ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plano atual</CardTitle>
          </CardHeader>
          <CardContent>
            {contractLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold tracking-tight">{formatBRL(monthly)}</p>
                <p className="text-xs text-muted-foreground mt-1">por mês</p>
                <div className="mt-3 space-y-1">
                  {contract ? (
                    <p className="text-xs text-muted-foreground">
                      Próxima cobrança em{" "}
                      <span className="font-medium text-foreground">
                        {formatDate(contract.current_period_end)}
                      </span>
                      {daysToRenew !== null && daysToRenew >= 0 && ` (${daysToRenew}d)`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum contrato ativo.</p>
                  )}
                </div>
                <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2 h-8 text-xs">
                  <Link to="/billing/contrato">
                    Ver contrato <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Credits: two independent pools (Sprint 8.1) ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Créditos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {creditsLoading ? (
              <Skeleton className="h-9 w-28" />
            ) : (
              <>
                {/* Never summed into one figure: a healthy Copilot balance says
                    nothing about whether the attendance agent is about to stop. */}
                <PoolBalanceCard
                  pool="whatsapp"
                  balance={credits!.whatsapp}
                  expiresAt={credits?.grantExpiresAt}
                  compact
                />
                <PoolBalanceCard
                  pool="copilot"
                  balance={credits!.copilot}
                  expiresAt={credits?.grantExpiresAt}
                  compact
                />
                <Button asChild variant="ghost" size="sm" className="h-8 text-xs -ml-2">
                  <Link to="/billing/creditos">
                    Recarregar <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Open invoice ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fatura em aberto</CardTitle>
          </CardHeader>
          <CardContent>
            {invoiceLoading ? (
              <Skeleton className="h-9 w-28" />
            ) : openInvoice ? (
              <>
                <p className="text-3xl font-bold tracking-tight">{formatBRL(openInvoice.total)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    vence {formatDate(openInvoice.due_date)}
                  </p>
                  <InvoiceStatusBadge status={openInvoice.status} />
                </div>
                <Button asChild size="sm" className="mt-4 w-full">
                  <Link to="/billing/faturas">
                    <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pagar
                  </Link>
                </Button>
              </>
            ) : (
              <div className="flex items-start gap-2 py-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Nenhuma fatura em aberto</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Está tudo em dia.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent invoices ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Últimas faturas</CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link to="/billing/faturas">
              Ver todas <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!invoices?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma fatura ainda.</p>
          ) : (
            <div className="divide-y divide-border">
              {invoices.slice(0, 5).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {inv.items?.[0]?.description ?? KIND_LABEL[inv.kind] ?? inv.kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.number} · {formatDate(inv.issued_at ?? inv.created_at)}
                      {(inv.items?.length ?? 0) > 1 && ` · +${(inv.items?.length ?? 0) - 1} item(s)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">{formatBRL(inv.total)}</span>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Zap className="w-3 h-3" />
        Créditos são debitados por ação de IA. O chat com sua equipe nunca consome créditos.
      </p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  setup: "Implantação",
  recurring: "Assinatura",
  credit_pack: "Recarga de créditos",
  adhoc: "Avulsa",
};
