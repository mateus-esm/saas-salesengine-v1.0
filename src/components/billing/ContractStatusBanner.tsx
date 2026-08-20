import { Link } from "react-router-dom";
import { AlertTriangle, Ban, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useContract, useOpenInvoice, useBillingAccount, formatBRL, formatDate, daysUntil } from "@/hooks/useBilling";

/** Grace window before read-only. Mirrors GRACE_DAYS in billing-cron. */
const GRACE_DAYS = 7;

/**
 * Sprint 8 T13 — account state, stated plainly.
 *
 * The most important element on the billing screens: what is wrong and what
 * happens if you ignore it. It renders nothing when there is nothing to do —
 * a healthy account should not be nagged.
 *
 * The countdown is the point. "Vencida" is abstract; "somente leitura em 3 dias"
 * is a decision. It is honest because the rule really is a fixed 7 days.
 */
export function ContractStatusBanner() {
  const { data: contractData } = useContract();
  const { data: openInvoice } = useOpenInvoice();
  const { data: account } = useBillingAccount();

  const contract = contractData?.contract;

  // Billing details missing: they cannot be charged at all, so say so before
  // they discover it at checkout.
  if (account && (!account.doc_number || !account.doc_type)) {
    return (
      <Banner
        tone="info"
        icon={Info}
        title="Complete seus dados de cobrança"
        body="Precisamos do seu CPF ou CNPJ para emitir faturas."
        cta={{ label: "Completar dados", to: "/billing/dados" }}
      />
    );
  }

  if (contract?.status === "suspended") {
    return (
      <Banner
        tone="critical"
        icon={Ban}
        title="Conta em modo somente leitura"
        body="Seus dados estão salvos e visíveis. A IA e os envios estão pausados até a fatura em aberto ser paga."
        cta={{ label: "Regularizar agora", to: "/billing/faturas" }}
      />
    );
  }

  if (contract?.status === "past_due") {
    const since = contract.past_due_since ? daysUntil(contract.past_due_since) : null;
    // past_due_since is in the past, so daysUntil is negative.
    const elapsed = since === null ? 0 : Math.abs(since);
    const remaining = Math.max(0, GRACE_DAYS - elapsed);

    return (
      <Banner
        tone="warn"
        icon={AlertTriangle}
        title={
          openInvoice?.due_date
            ? `Fatura de ${formatBRL(openInvoice.total)} vencida em ${formatDate(openInvoice.due_date)}`
            : "Você tem uma fatura vencida"
        }
        body={
          remaining > 0
            ? `Sua conta entra em modo somente leitura em ${remaining} ${remaining === 1 ? "dia" : "dias"}. Seus dados continuam salvos.`
            : "Sua conta entra em modo somente leitura a qualquer momento. Seus dados continuam salvos."
        }
        cta={{ label: "Pagar agora", to: "/billing/faturas" }}
      />
    );
  }

  return null;
}

interface BannerProps {
  tone: "info" | "warn" | "critical";
  icon: React.ElementType;
  title: string;
  body: string;
  cta: { label: string; to: string };
}

const TONES = {
  info: "border-blue-500/30 bg-blue-500/8 text-blue-700 dark:text-blue-300",
  warn: "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
  critical: "border-red-500/30 bg-red-500/8 text-red-700 dark:text-red-300",
} as const;

function Banner({ tone, icon: Icon, title, body, cta }: BannerProps) {
  return (
    <div className={cn("mb-4 rounded-lg border px-4 py-3 flex items-start gap-3", TONES[tone])}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{body}</p>
      </div>
      <Button asChild size="sm" variant={tone === "critical" ? "destructive" : "default"} className="shrink-0">
        <Link to={cta.to}>{cta.label}</Link>
      </Button>
    </div>
  );
}
