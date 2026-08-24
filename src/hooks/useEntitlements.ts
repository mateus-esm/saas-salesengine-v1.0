import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Sprint 8 T12 — what this tenant may use, derived from their contract.
 *
 * Before this, access came from `equipes.page_permissions`, a JSONB somebody had
 * to remember to toggle after a sale. Now it follows what was actually bought,
 * and page_permissions survives only as a super-admin override.
 */
export interface Entitlements {
  equipeId: string;
  contractId: string | null;
  contractStatus: "none" | "draft" | "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  /** Dunning end state: data visible, AI and outbound stopped. */
  isReadOnly: boolean;
  /** Sprint 9: `trialing` counts as live — the trial exists to be used. */
  isLive: boolean;
  modules: string[];
  seatLimit: number | null;
  agentLimit: number | null;
  includedCredits: number;
  includedCreditsWhatsapp: number;
  includedCreditsCopilot: number;
  instanceLimit: number;
  builderHours: number;
  builderRecurrence: string | null;
  currentPeriodEnd: string | null;
  pagePermissions: Record<string, boolean> | null;
}

export function useEntitlements() {
  const { equipe } = useAuth();
  const equipeId = equipe?.id;

  const query = useQuery({
    queryKey: ["entitlements", equipeId],
    enabled: !!equipeId,
    // Entitlements change on payment, not on navigation.
    staleTime: 60_000,
    queryFn: async (): Promise<Entitlements | null> => {
      if (!equipeId) return null;
      const { data, error } = await supabase
        .from("v_tenant_entitlements")
        .select("*")
        .eq("equipe_id", equipeId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      return {
        equipeId: row.equipe_id as string,
        contractId: (row.contract_id as string) ?? null,
        contractStatus: (row.contract_status as Entitlements["contractStatus"]) ?? "none",
        isReadOnly: Boolean(row.is_read_only),
        isLive: Boolean(row.is_live),
        modules: (row.modules as string[]) ?? [],
        seatLimit: (row.seat_limit as number) ?? null,
        agentLimit: (row.agent_limit as number) ?? null,
        includedCredits: Number(row.included_credits ?? 0),
        includedCreditsWhatsapp: Number(row.included_credits_whatsapp ?? 0),
        includedCreditsCopilot: Number(row.included_credits_copilot ?? 0),
        instanceLimit: Number(row.instance_limit ?? 0),
        builderHours: Number(row.builder_hours ?? 0),
        builderRecurrence: (row.builder_recurrence as string) ?? null,
        currentPeriodEnd: (row.current_period_end as string) ?? null,
        pagePermissions: (row.page_permissions as Record<string, boolean>) ?? null,
      };
    },
  });

  /**
   * Effective access for a page/module key.
   *
   * An explicit override wins in both directions; otherwise it follows the
   * contract. Defaults to allowed when nothing is known, so a tenant is never
   * locked out of the product by a missing row — billing state is enforced
   * server-side by RLS regardless.
   */
  const canAccess = (moduleKey: string): boolean => {
    const ent = query.data;
    if (!ent) return true;
    const override = ent.pagePermissions?.[moduleKey];
    if (typeof override === "boolean") return override;
    if (ent.modules.length === 0) return true;
    return ent.modules.includes(moduleKey);
  };

  return {
    entitlements: query.data ?? null,
    isLoading: query.isLoading,
    canAccess,
    /** True when the account is suspended for non-payment: reads yes, writes no. */
    isReadOnly: query.data?.isReadOnly ?? false,
  };
}
