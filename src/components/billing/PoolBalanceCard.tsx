import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MessageCircle, Sparkles } from "lucide-react";
import { formatCredits, formatDate, type PoolBalance, type CreditPool } from "@/hooks/useBilling";

const POOL_META: Record<CreditPool, { label: string; hint: string; icon: React.ElementType; accent: string }> = {
  whatsapp: {
    label: "Atendimento",
    hint: "Consumidos quando o agente responde seus clientes",
    icon: MessageCircle,
    accent: "text-green-600",
  },
  copilot: {
    label: "Copiloto",
    hint: "Consumidos pelas ações automáticas no CRM",
    icon: Sparkles,
    accent: "text-violet-600",
  },
};

/**
 * Sprint 8.1 — one pool, rendered honestly.
 *
 * Two things this must never blur:
 *  · the pools are independent, so a healthy Copilot balance says nothing about
 *    whether the attendance agent is about to stop;
 *  · purchased credits survive renewal, which is why they are shown apart from
 *    the plan grant rather than summed into one number.
 */
export function PoolBalanceCard({
  pool, balance, expiresAt, compact,
}: {
  pool: CreditPool;
  balance: PoolBalance;
  expiresAt?: string | null;
  compact?: boolean;
}) {
  const meta = POOL_META[pool];
  const Icon = meta.icon;
  const pct = balance.grantTotal > 0
    ? Math.min(100, Math.round((balance.expiring / balance.grantTotal) * 100))
    : 0;
  const empty = balance.total <= 0;

  return (
    <div className={cn("rounded-lg border border-border p-4", empty && "border-destructive/40 bg-destructive/[0.03]")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", empty ? "text-destructive" : meta.accent)} />
        <p className="text-sm font-medium">{meta.label}</p>
      </div>

      <p className={cn("mt-2 font-bold tracking-tight", compact ? "text-2xl" : "text-3xl", empty && "text-destructive")}>
        {formatCredits(balance.total)}
      </p>
      <p className="text-xs text-muted-foreground">
        {balance.grantTotal > 0
          ? `${formatCredits(balance.expiring)} de ${formatCredits(balance.grantTotal)} do plano`
          : "sem créditos do plano neste período"}
      </p>

      {balance.grantTotal > 0 && <Progress value={pct} className="mt-2.5 h-1.5" />}

      <div className="mt-2.5 space-y-0.5 text-[11px] text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{formatCredits(balance.expiring)}</span> do plano
          {expiresAt && ` — expiram ${formatDate(expiresAt)}`}
        </p>
        <p>
          <span className="font-medium text-foreground">{formatCredits(balance.permanent)}</span> avulsos — não expiram
        </p>
      </div>

      {!compact && <p className="text-[11px] text-muted-foreground mt-2">{meta.hint}</p>}

      {empty && (
        <p className="text-[11px] text-destructive mt-2 font-medium">
          {pool === "whatsapp"
            ? "O agente parou de responder. Recarregue para religar."
            : "As ações automáticas do CRM estão pausadas."}
        </p>
      )}
    </div>
  );
}
