import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Sprint 8 T13 — the billing data layer.
 *
 * One source per number. The Sprint 7.5 bug where the chart and the model list
 * disagreed by 2x came from two places computing the same figure; every value
 * here is read from exactly one query.
 */

export type InvoiceStatus = "draft" | "open" | "paid" | "overdue" | "void" | "refunded";
export type InvoiceKind = "setup" | "recurring" | "credit_pack" | "adhoc";

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  total: number;
  due_date: string | null;
  issued_at: string | null;
  paid_at: string | null;
  asaas_invoice_url: string | null;
  pix_payload: string | null;
  created_at: string;
}

/** Sprint 8.1 — attendance and Copilot credits are separate pools. */
export type CreditPool = "whatsapp" | "copilot";

export interface PoolBalance {
  total: number;
  /** Left of this period's plan grant. Expires at period end. */
  expiring: number;
  /** Purchased credits. Never expire. */
  permanent: number;
  /** What the period's grant started at — the gauge's denominator. */
  grantTotal: number;
}

export interface CreditBalance {
  whatsapp: PoolBalance;
  copilot: PoolBalance;
  /** Both pools combined. Display only — never charge against this. */
  total: number;
  grantExpiresAt: string | null;
}

/** Money, always through Intl — never 'R$ ' + value. */
export const formatBRL = (value: number | string | null | undefined): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));

export const formatCredits = (value: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(Number(value ?? 0))));

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Whole days from today until `date`. Negative when already past. */
export const daysUntil = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const target = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export function useEquipeId(): string | undefined {
  const { equipe } = useAuth();
  return equipe?.id;
}

export function useInvoices(status?: InvoiceStatus[]) {
  const equipeId = useEquipeId();
  return useQuery({
    queryKey: ["invoices", equipeId, status?.join(",") ?? "all"],
    enabled: !!equipeId,
    queryFn: async (): Promise<Invoice[]> => {
      let q = supabase
        .from("invoices")
        .select("id, number, kind, status, subtotal, discount, total, due_date, issued_at, paid_at, asaas_invoice_url, pix_payload, created_at")
        .eq("equipe_id", equipeId!)
        .order("created_at", { ascending: false });
      if (status?.length) q = q.in("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

/** The single open/overdue invoice the overview nudges about. */
export function useOpenInvoice() {
  const { data, ...rest } = useInvoices(["open", "overdue"]);
  const sorted = (data ?? []).slice().sort((a, b) => {
    // Overdue first, then soonest due date.
    if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
    return (a.due_date ?? "").localeCompare(b.due_date ?? "");
  });
  return { ...rest, data: sorted[0] ?? null, count: sorted.length };
}

export function useCreditBalance() {
  const equipeId = useEquipeId();
  return useQuery({
    queryKey: ["credit-balance", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<CreditBalance> => {
      const { data, error } = await supabase
        .from("v_credit_balance")
        .select("total, whatsapp_total, copilot_total, whatsapp_expiring, copilot_expiring, grant_expires_at")
        .eq("equipe_id", equipeId!)
        .maybeSingle();
      if (error) throw error;

      // The gauges need what each period STARTED with; the balance view reports
      // what is left. One query for both pools rather than two round trips.
      const { data: grants } = await supabase
        .from("credit_ledger")
        .select("credits, pool, created_at")
        .eq("equipe_id", equipeId!)
        .eq("entry_type", "grant")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      const grantFor = (pool: CreditPool): number =>
        Number((grants ?? []).find((g) => (g as { pool?: string }).pool === pool)?.credits ?? 0);

      const build = (total: number, expiring: number, pool: CreditPool): PoolBalance => ({
        total,
        expiring,
        // Derived, never queried separately — two sources for one number is how
        // the Sprint 7.5 discrepancy happened.
        permanent: Math.max(0, total - expiring),
        grantTotal: grantFor(pool),
      });

      const wa = Number(data?.whatsapp_total ?? 0);
      const cp = Number(data?.copilot_total ?? 0);
      return {
        whatsapp: build(wa, Number(data?.whatsapp_expiring ?? 0), "whatsapp"),
        copilot: build(cp, Number(data?.copilot_expiring ?? 0), "copilot"),
        total: Number(data?.total ?? wa + cp),
        grantExpiresAt: (data?.grant_expires_at as string) ?? null,
      };
    },
  });
}

export interface ContractItemRow {
  id: string;
  quantity: number;
  unit_price: number;
  period: "monthly" | "one_time";
  product: { code: string; name: string; list_price: number; kind: string } | null;
}

export function useContract() {
  const equipeId = useEquipeId();
  return useQuery({
    queryKey: ["contract", equipeId],
    enabled: !!equipeId,
    queryFn: async () => {
      const { data: contract, error } = await supabase
        .from("contracts")
        .select("id, status, term_months, started_at, current_period_start, current_period_end, past_due_since")
        .eq("equipe_id", equipeId!)
        .in("status", ["draft", "active", "past_due", "suspended"])
        .maybeSingle();
      if (error) throw error;
      if (!contract) return { contract: null, items: [] as ContractItemRow[], monthlyTotal: 0 };

      const { data: items } = await supabase
        .from("contract_items")
        .select("id, quantity, unit_price, period, billing_products(code, name, list_price, kind)")
        .eq("contract_id", contract.id);

      const rows: ContractItemRow[] = (items ?? []).map((i) => {
        const r = i as Record<string, unknown>;
        return {
          id: r.id as string,
          quantity: Number(r.quantity ?? 1),
          unit_price: Number(r.unit_price ?? 0),
          period: (r.period as "monthly" | "one_time") ?? "monthly",
          product: (r.billing_products as ContractItemRow["product"]) ?? null,
        };
      });

      const monthlyTotal = rows
        .filter((r) => r.period === "monthly")
        .reduce((s, r) => s + r.unit_price * r.quantity, 0);

      return { contract, items: rows, monthlyTotal };
    },
  });
}

export function useCreditPacks() {
  return useQuery({
    queryKey: ["credit-packs"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_products")
        .select("id, code, name, list_price, credits_included")
        .eq("kind", "credit_pack")
        .eq("active", true)
        .order("credits_included", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBillingAccount() {
  const equipeId = useEquipeId();
  return useQuery({
    queryKey: ["billing-account", equipeId],
    enabled: !!equipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_accounts")
        .select("*")
        .eq("equipe_id", equipeId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** The credit ledger, as a statement the customer can audit. */
export function useCreditLedger(limit = 50) {
  const equipeId = useEquipeId();
  return useQuery({
    queryKey: ["credit-ledger", equipeId, limit],
    enabled: !!equipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_ledger")
        .select("id, entry_type, credits, source, created_at, expires_at, metadata, pool")
        .eq("equipe_id", equipeId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** After a payment lands, every billing number is stale at once. */
export function useRefreshBilling() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["invoices", "credit-balance", "contract", "credit-ledger", "entitlements", "billing-account"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}
