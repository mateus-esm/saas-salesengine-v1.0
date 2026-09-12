import { format } from "date-fns";
import { Receipt } from "lucide-react";

import { useDealRevenue, netRevenue, type RevenueKind } from "@/hooks/useDealRevenue";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { cn } from "@/lib/utils";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", signDisplay: "exceptZero" })
    .format(v)
    .replace(/\u00a0/g, " ");

const plain = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");

const KIND_LABEL: Record<RevenueKind, string> = {
  booking: "Lançamento",
  adjustment: "Ajuste",
  reversal: "Estorno",
};

const day = (iso: string) => {
  try {
    return format(new Date(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
};

interface DealRevenueSectionProps {
  opportunityId: string;
  open: boolean;
}

/**
 * Sprint 11 · Onda 3 · T31 — what the deal has put in the books. The win books
 * the revenue (per item, or the value), a reopen reverses it and an edit to a
 * won deal adjusts it — always in the period of the win, under its owner then.
 * Nothing here is editable: the ledger is the database's.
 */
export function DealRevenueSection({ opportunityId, open }: DealRevenueSectionProps) {
  const { data: entries = [], isLoading } = useDealRevenue(opportunityId, open);
  const { nameOf } = useMemberDirectory();

  if (isLoading || entries.length === 0) return null;

  const net = netRevenue(entries);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          Receita
        </h4>
        <span className={cn("text-sm font-semibold tabular-nums", net > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          {plain(net)}
        </span>
      </div>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="tabular-nums">{day(e.recognized_at)}</span>
              {" · "}
              <span className="font-medium text-foreground/80">{KIND_LABEL[e.kind]}</span>
              {e.item_name ? ` · ${e.item_name}` : ""}
              {e.owner_id ? ` · ${nameOf(e.owner_id) ?? "Usuário removido"}` : ""}
            </span>
            <span className={cn("shrink-0 tabular-nums", e.amount < 0 ? "text-destructive" : "text-foreground/80")}>
              {money(e.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
