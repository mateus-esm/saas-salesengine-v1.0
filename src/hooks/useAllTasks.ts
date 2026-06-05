import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Tasks lag in generated types; scope is enforced via the leads inner-join.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface AllTaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  assigned_to: string | null;
  lead_id: string;
  leadName: string | null;
  created_at: string | null;
}

/**
 * Sprint 5.2 T13 — aggregated task ledger for the whole tenant.
 *
 * Unlike useTasks (single lead), this returns every task across all pipelines,
 * scoped to the team via the leads inner-join, ordered by deadline. Powers the
 * dedicated Tasks page.
 */
export const useAllTasks = () => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["all_tasks", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<AllTaskRow[]> => {
      const { data, error } = await sb
        .from("tasks")
        .select(
          "id, title, description, due_date, status, assigned_to, lead_id, created_at, lead:leads!inner(name, equipe_id)",
        )
        .eq("lead.equipe_id", equipeId)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (error) throw error;

      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        due_date: (r.due_date as string | null) ?? null,
        status: (r.status as string | null) ?? "pending",
        assigned_to: (r.assigned_to as string | null) ?? null,
        lead_id: r.lead_id as string,
        leadName: ((r.lead as { name?: string } | null)?.name as string | undefined) ?? null,
        created_at: (r.created_at as string | null) ?? null,
      }));
    },
  });
};
