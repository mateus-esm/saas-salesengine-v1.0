/**
 * Sprint 9 — reading and writing the dashboard layout.
 *
 * Resolution order is personal → team default → catalogue default, with no
 * merging. See the migration header for why a merge would be wrong.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  defaultLayout,
  reconcileLayout,
  type WidgetSetting,
} from "@/config/widgetCatalog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface LayoutRow {
  user_id: string | null;
  widgets: WidgetSetting[];
}

export interface ResolvedLayout {
  layout: WidgetSetting[];
  /** True when the user has a row of their own, i.e. "voltar ao padrão" applies. */
  isPersonal: boolean;
  /** True when the team has a saved default — changes the wording in the UI. */
  hasTeamDefault: boolean;
}

export function useDashboardLayout(page = "overview") {
  const { profile, user } = useAuth();
  const equipeId = profile?.equipe_id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard_layout", equipeId, user?.id, page],
    enabled: !!equipeId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ResolvedLayout> => {
      // Both candidate rows come back in one request; RLS already restricts
      // this to the caller's team, and there are at most two rows to consider.
      const { data, error } = await sb
        .from("dashboard_layouts")
        .select("user_id, widgets")
        .eq("equipe_id", equipeId)
        .eq("page", page);

      if (error) throw error;

      const rows = (data ?? []) as LayoutRow[];
      const personal = rows.find((r) => r.user_id === user?.id);
      const team = rows.find((r) => r.user_id === null);

      return {
        layout: reconcileLayout(personal?.widgets ?? team?.widgets ?? defaultLayout()),
        isPersonal: !!personal,
        hasTeamDefault: !!team,
      };
    },
  });

  const save = useMutation({
    mutationFn: async ({ layout, asTeam }: { layout: WidgetSetting[]; asTeam: boolean }) => {
      const { error } = await sb.rpc("save_dashboard_layout", {
        p_widgets: layout,
        p_as_team: asTeam,
        p_page: page,
      });
      if (error) throw error;
      return asTeam;
    },
    onSuccess: (asTeam) => {
      qc.invalidateQueries({ queryKey: ["dashboard_layout"] });
      toast.success(
        asTeam ? "Padrão da equipe atualizado" : "Seu dashboard foi salvo",
      );
    },
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível salvar o layout"),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("reset_dashboard_layout", { p_page: page });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard_layout"] });
      toast.success("Voltou para o padrão da equipe");
    },
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível restaurar"),
  });

  return {
    layout: query.data?.layout ?? defaultLayout(),
    isPersonal: query.data?.isPersonal ?? false,
    hasTeamDefault: query.data?.hasTeamDefault ?? false,
    isLoading: query.isLoading,
    save: save.mutate,
    isSaving: save.isPending,
    reset: reset.mutate,
    isResetting: reset.isPending,
  };
}
