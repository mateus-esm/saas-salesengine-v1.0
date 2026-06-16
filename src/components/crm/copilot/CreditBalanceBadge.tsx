// src/components/crm/copilot/CreditBalanceBadge.tsx
//
// Sprint 6.1 · EPIC F · F2 — header wallet widget.
//
// Compact badge showing the Copilot credit balance with a low-balance (amber)
// warning under a threshold, linking to the billing top-up flow. The Copilot
// wallet is a separate balance from GPT-Maker/Asaas credits but shares the same
// payment rail (Billing page).

import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useCreditBalance } from "@/hooks/useCopilotCredits";

const LOW_BALANCE_THRESHOLD = 50;

export function CreditBalanceBadge({ className }: { className?: string }) {
  const { data: balance, isLoading } = useCreditBalance();

  if (isLoading || balance === undefined) return null;

  const low = balance < LOW_BALANCE_THRESHOLD;

  return (
    <Link to="/billing?tab=copilot" title="Créditos do Copilot — clique para recarregar">
      <Badge
        variant={low ? "destructive" : "secondary"}
        className={cn("gap-1 font-mono", low && "bg-amber-500/15 text-amber-600 dark:text-amber-400", className)}
      >
        <Zap className="h-3 w-3" />
        {balance.toLocaleString("pt-BR")}
        {low && <span className="ml-0.5 not-italic">· recarregar</span>}
      </Badge>
    </Link>
  );
}
