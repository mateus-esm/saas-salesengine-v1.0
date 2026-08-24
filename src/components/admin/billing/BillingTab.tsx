import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Search, Settings2, AlertTriangle, PauseCircle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatCredits, formatDate } from "@/hooks/useBilling";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import type { InvoiceStatus } from "@/hooks/useBilling";
import { TeamBillingDialog, type TeamBillingRow } from "./TeamBillingDialog";
import { InvoiceActions } from "./InvoiceActions";
import { AdhocInvoiceDialog } from "./AdhocInvoiceDialog";

const CONTRACT_STATUS: Record<string, { label: string; className: string }> = {
  none:      { label: "Sem plano",  className: "bg-muted text-muted-foreground" },
  draft:     { label: "Rascunho",   className: "bg-muted text-muted-foreground" },
  // Sprint 9: a trial is live and unpaid. Blue, not green — it is not revenue
  // yet, and without its own entry it fell back to "Sem plano".
  trialing:  { label: "Em teste",   className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  active:    { label: "Ativo",      className: "bg-green-500/10 text-green-700 dark:text-green-300" },
  past_due:  { label: "Em atraso",  className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  suspended: { label: "Suspenso",   className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  cancelled: { label: "Cancelado",  className: "bg-muted text-muted-foreground" },
};

/**
 * Sprint 8.2 — the admin billing screen is organised around TEAMS, not invoices.
 *
 * The operational question is "who needs attention and what do I do about it",
 * and a flat invoice list answers neither. Each row is a tenant with its plan,
 * both credit pools, seats, instances contracted vs connected, and what it owes;
 * clicking one opens the panel that can actually fix it.
 */
export function AdminBillingTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<TeamBillingRow | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | InvoiceStatus>("all");
  const [adhocOpen, setAdhocOpen] = useState(false);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["admin-team-billing"],
    queryFn: async (): Promise<TeamBillingRow[]> => {
      const { data, error } = await supabase
        .from("v_admin_team_billing")
        .select("*")
        .order("mrr", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamBillingRow[];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, kind, status, total, due_date, paid_at, equipes(nome)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (teams ?? []).filter((t) => {
    if (statusFilter !== "all" && t.contract_status !== statusFilter) return false;
    if (!search.trim()) return true;
    return t.nome?.toLowerCase().includes(search.toLowerCase());
  });

  const mrr = (teams ?? [])
    .filter((t) => ["active", "past_due"].includes(t.contract_status))
    .reduce((s, t) => s + Number(t.mrr ?? 0), 0);
  const owed = (teams ?? []).reduce((s, t) => s + Number(t.open_amount ?? 0), 0);
  const noPlan = (teams ?? []).filter((t) => t.contract_status === "none").length;
  const paused = (teams ?? []).filter((t) => t.agent_paused_at).length;

  const invoiceRows = (invoices ?? []).filter((i) => invoiceFilter === "all" || i.status === invoiceFilter);

  return (
    <div className="space-y-4">
      {/* ── What needs attention ── */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="MRR" value={formatBRL(mrr)} hint="planos ativos, preço negociado" />
        <Stat label="Em aberto" value={formatBRL(owed)} hint="faturas não pagas" danger={owed > 0} />
        <Stat label="Sem plano" value={String(noPlan)} hint="equipes a regularizar" danger={noPlan > 0} />
        <Stat label="Agentes pausados" value={String(paused)} hint="sem crédito ou suspensos" danger={paused > 0} />
      </div>

      {/* ── Teams ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
          <CardTitle className="text-base">Equipes</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar equipe"
                className="pl-8 h-8 w-[180px] text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma equipe encontrada.</p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((t) => {
                const s = CONTRACT_STATUS[t.contract_status] ?? CONTRACT_STATUS.none;
                const overInstances = t.instances_connected > t.instances_contracted;
                const overSeats = t.seat_limit != null && t.seats_used > t.seat_limit;
                return (
                  <button
                    key={t.equipe_id}
                    onClick={() => setSelected(t)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{t.nome}</span>
                        <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>
                        {t.plan_name && <Badge variant="outline" className="text-[10px]">{t.plan_name}</Badge>}
                        {t.agent_paused_at && (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 dark:text-red-300 gap-1">
                            <PauseCircle className="w-3 h-3" /> agente pausado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span>Atend. {formatCredits(t.whatsapp_balance)}</span>
                        <span>Copiloto {formatCredits(t.copilot_balance)}</span>
                        <span className={overSeats ? "text-amber-600 font-medium" : ""}>
                          {t.seats_used}
                          {t.seat_limit != null ? `/${t.seat_limit}` : ""} usuários
                        </span>
                        <span className={overInstances ? "text-amber-600 font-medium" : ""}>
                          {t.instances_connected}/{t.instances_contracted} instâncias
                        </span>
                        {t.current_period_end && <span>renova {formatDate(t.current_period_end)}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{formatBRL(t.mrr)}<span className="text-[10px] font-normal text-muted-foreground">/mês</span></p>
                      {Number(t.open_amount) > 0 && (
                        <p className="text-[11px] text-destructive flex items-center gap-1 justify-end">
                          <AlertTriangle className="w-3 h-3" /> {formatBRL(t.open_amount)} em aberto
                        </p>
                      )}
                    </div>

                    <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Invoices ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Faturas</CardTitle>
          <div className="flex items-center gap-2">
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
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAdhocOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Fatura avulsa
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!invoiceRows.length ? (
            <div className="py-10 text-center">
              <Receipt className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma fatura.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {invoiceRows.map((i) => {
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
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatBRL(i.total as number)}
                      </span>
                      <InvoiceActions
                        invoice={{
                          id: i.id as string,
                          number: i.number as string,
                          status: i.status as string,
                          total: Number(i.total),
                          due_date: (i.due_date as string) ?? null,
                          kind: i.kind as string | undefined,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TeamBillingDialog
        team={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      <AdhocInvoiceDialog
        teams={(teams ?? []).map((t) => ({ equipe_id: t.equipe_id, nome: t.nome }))}
        open={adhocOpen}
        onOpenChange={setAdhocOpen}
      />
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
