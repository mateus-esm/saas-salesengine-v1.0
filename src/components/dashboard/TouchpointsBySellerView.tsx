/**
 * SE-SUP1-5 (#13) — quem está trabalhando: touchpoints por vendedor.
 *
 * Tabela com barra, não gráfico de recharts: o número exato é a resposta e a
 * barra só ordena o olhar. Zero é mostrado ("0 touchpoints"), não escondido —
 * um painel vazio parece quebrado; um zero explícito parece um dia parado.
 */
import { EmptyChart, formatInt } from "./chart-primitives";
import { barPercent, sellerLabel, type TouchpointsBySeller } from "@/lib/touchpointsBySeller";

export function TouchpointsBySellerView({ data }: { data?: TouchpointsBySeller }) {
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total no período</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatInt(total)} {total === 1 ? "touchpoint" : "touchpoints"}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyChart message="Nenhum touchpoint registrado no período." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.seller_id ?? "none"} className="text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-foreground">{sellerLabel(r)}</span>
                <span className="shrink-0 font-medium tabular-nums">{formatInt(r.touchpoints)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${barPercent(r.touchpoints, rows)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
