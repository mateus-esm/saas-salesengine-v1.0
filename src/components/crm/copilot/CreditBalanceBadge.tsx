// src/components/crm/copilot/CreditBalanceBadge.tsx
//
// Sprint 8.1 — TWO badges, because there are two wallets.
//
// This previously showed a single number labelled "Copilot" that was actually
// reading whichever agent_credits_balance row came back first. After the pool
// split that was the WhatsApp row, so a tenant with 1000 attendance credits and
// 0 Copilot credits saw "1000" next to a Copilot label while /billing correctly
// showed 0. Same underlying data, two different answers — exactly the class of
// bug this sprint exists to eliminate.
//
// Both pools are shown because a healthy Copilot balance says nothing about
// whether the attendance agent is about to stop answering customers.

import { Link } from "react-router-dom";
import { MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useCreditBalance } from "@/hooks/useCopilotCredits";

const LOW_BALANCE_THRESHOLD = 50;

interface PoolBadgeProps {
  pool: "whatsapp" | "copilot";
  className?: string;
}

const META = {
  whatsapp: {
    icon: MessageCircle,
    label: "Atendimento",
    title: "Créditos de Atendimento — o agente responde seus clientes",
  },
  copilot: {
    icon: Sparkles,
    label: "Copiloto",
    title: "Créditos do Copiloto — ações automáticas no CRM",
  },
} as const;

function PoolBadge({ pool, className }: PoolBadgeProps) {
  const { data: balance, isLoading } = useCreditBalance(pool);
  if (isLoading || balance === undefined) return null;

  const meta = META[pool];
  const Icon = meta.icon;
  const empty = balance <= 0;
  const low = balance < LOW_BALANCE_THRESHOLD;

  return (
    <Link to="/billing/creditos" title={meta.title}>
      <Badge
        variant={empty ? "destructive" : "secondary"}
        className={cn(
          "gap-1 font-mono",
          !empty && low && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          className,
        )}
      >
        <Icon className="h-3 w-3" />
        <span className="hidden sm:inline not-italic font-sans text-[10px] opacity-70">
          {meta.label}
        </span>
        {balance.toLocaleString("pt-BR")}
      </Badge>
    </Link>
  );
}

/** Both wallets, side by side. */
export function CreditBalanceBadge({ className }: { className?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <PoolBadge pool="whatsapp" className={className} />
      <PoolBadge pool="copilot" className={className} />
    </div>
  );
}
