/**
 * Sprint 9 — "best opportunities", in the Vision's words.
 *
 * Ranked by value, but the column that earns its place is "parado há" — a
 * R$ 80.000 deal nobody has touched in three weeks is the most actionable line
 * in the whole dashboard, and it is invisible in every chart above.
 *
 * Staleness is flagged with an icon and a word, not colour alone.
 */
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TopOpportunity } from "@/types/dashboard";
import { EmptyChart, formatBRL } from "./chart-primitives";
import { cn } from "@/lib/utils";

/** Beyond this, a deal is stale enough to name. */
const STALE_DAYS = 14;

export function TopOpportunitiesTable({ rows }: { rows: TopOpportunity[] }) {
  if (!rows.length) {
    return <EmptyChart message="Nenhuma oportunidade aberta no momento." />;
  }

  return (
    // Wide content scrolls inside its own container; the page never scrolls
    // sideways.
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[620px] text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <Th>Lead</Th>
            <Th className="text-right">Valor</Th>
            <Th>Etapa</Th>
            <Th>Responsável</Th>
            <Th className="text-right">Parado há</Th>
            <Th className="text-right">Último contato</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stale = r.days_in_stage >= STALE_DAYS;
            return (
              <tr key={r.opportunity_id} className="border-b border-border/50 last:border-0">
                <Td className="max-w-[180px] truncate font-medium text-foreground">
                  {r.lead_name}
                </Td>
                <Td className="text-right font-semibold tabular-nums text-foreground">
                  {formatBRL(r.value)}
                </Td>
                <Td className="text-muted-foreground">{r.stage_name ?? "—"}</Td>
                <Td className="max-w-[140px] truncate text-muted-foreground">
                  {r.responsible_name ?? "Não atribuído"}
                </Td>
                <Td className="text-right tabular-nums">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      stale ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {stale && <AlertTriangle className="h-3 w-3" />}
                    {r.days_in_stage} d
                  </span>
                </Td>
                <Td className="text-right text-muted-foreground">
                  {r.last_touch_at
                    ? formatDistanceToNowStrict(new Date(r.last_touch_at), {
                        locale: ptBR,
                        addSuffix: true,
                      })
                    : "nunca"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th
    className={cn(
      "pb-2 pr-3 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground",
      className,
    )}
  >
    {children}
  </th>
);

const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("py-2 pr-3", className)}>{children}</td>
);
