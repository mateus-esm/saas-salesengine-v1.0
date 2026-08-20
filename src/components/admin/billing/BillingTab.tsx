import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/hooks/useBilling";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import type { InvoiceStatus } from "@/hooks/useBilling";

const CONTRACT_STATUS: Record<string, { label: string; className: string }> = {
  draft:     { label: "Rascunho",     className: "bg-muted text-muted-foreground" },
  active:    { label: "Ativo",        className: "bg-green-500/10 text-green-700 dark:text-green-300" },
  past_due:  { label: "Em atraso",    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  suspended: { label: "Suspenso",     className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  cancelled: { label: "Cancelado",    className: "bg-muted text-muted-foreground" },
};

/**
 * Sprint 8 T16 — the revenue view.
 *
 * MRR counts monthly contract_items on live contracts at the NEGOTIATED price,
 * which is why it can differ from the sum of catalog list prices.
 */
export function AdminBillingTab() {
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | InvoiceStatus>("all");

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ["admin-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, status, current_period_end, term_months, equipes(nome), contract_items(quantity, unit_price, period)")
        .in("status", ["draft", "active", "past_due", "suspended"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, kind, status, total, due_date, issued_at, paid_at, equipes(nome)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthlyOf = (c: Record<string, unknown>): number =>
    ((c.contract_items as Array<{ quantity: number; unit_price: number; period: string }>) ?? [])
      .filter((i) => i.period === "monthly")
      .reduce((s, i) => s + Number(i.unit_price) * (i.quantity ?? 1), 0);

  const mrr = (contracts ?? [])
    .filter((c) => ["active", "past_due"].includes(c.status as string))
    .reduce((s, c) => s + monthlyOf(c as Record<string, unknown>), 0);

  const open = (invoices ?? []).filter((i) => i.status === "open");
  const overdue = (invoices ?? []).filter((i) => i.status === "overdue");
  const paidThisMonth = (invoices ?? []).filter((i) => {
    if (i.status !== "paid" || !i.paid_at) return false;
    const d = new Date(i.paid_at as string);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const rows = (invoices ?? []).filter((i) => invoiceFilter === "all" || i.status === invoiceFilter);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="MRR" value={formatBRL(mrr)} hint="contratos ativos, preço negociado" />
        <Stat label="Em aberto" value={formatBRL(open.reduce((s, i) => s + Number(i.total), 0))} hint={`${open.length} faturas`} />
        <Stat label="Vencidas" value={formatBRL(overdue.reduce((s, i) => s + Number(i.total), 0))} hint={`${overdue.length} faturas`} danger={overdue.length > 0} />
        <Stat label="Recebido no mês" value={formatBRL(paidThisMonth.reduce((s, i) => s + Number(i.total), 0))} hint={`${paidThisMonth.length} pagamentos`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contratos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {contractsLoading ? (
            <div className="p-4 space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !contracts?.length ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Nenhum contrato.</p>
          ) : (
            <div className="divide-y divide-border">
              {contracts.map((c) => {
                const s = CONTRACT_STATUS[c.status as string] ?? CONTRACT_STATUS.draft;
                const equipe = c.equipes as { nome?: string } | null;
                return (
                  <div key={c.id as string} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{equipe?.nome ?? "—"}</p>
                        <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        renova {formatDate(c.current_period_end as string)}
                        {c.term_months ? ` · ${c.term_months} meses` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0">
                      {formatBRL(monthlyOf(c as Record<string, unknown>))}/mês
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Faturas</CardTitle>
          <Select value={invoiceFilter} onValueChange={(v) => setInvoiceFilter(v as typeof invoiceFilter)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="open">Em aberto</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem>
              <SelectItem value="paid">Pagas</SelectItem>
              <SelectItem value="void">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {invoicesLoading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !rows.length ? (
            <div className="py-12 text-center">
              <Receipt className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma fatura.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
              {rows.map((i) => {
                const equipe = i.equipes as { nome?: string } | null;
                return (
                  <div key={i.id as string} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{i.number as string}</span>
                        <InvoiceStatusBadge status={i.status as InvoiceStatus} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {equipe?.nome ?? "—"} · vence {formatDate(i.due_date as string)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {formatBRL(i.total as number)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${danger ? "text-destructive" : ""}`}>{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
