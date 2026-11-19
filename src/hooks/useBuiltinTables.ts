import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BUILTIN_TABLES, type BuiltinTable } from "@/lib/crmTabs";

export function useBuiltinTables() {
  const { profile } = useAuth();
  const team = profile?.equipe_id;
  const qc = useQueryClient();
  const key = ["crm_builtin_tables", team];
  const { data, isLoading, isError } = useQuery({
    queryKey: key, enabled: !!team, staleTime: 60_000,
    queryFn: async (): Promise<{ slug: BuiltinTable; enabled: boolean }[]> => {
      const { data, error } = await (supabase as any).from("crm_builtin_tables").select("slug, enabled").eq("equipe_id", team);
      if (error) throw error;
      return data;
    },
  });
  const update = useMutation({
    mutationFn: async ({slug, enabled}: { slug: BuiltinTable; enabled: boolean }) => {
      const { error } = await (supabase as any).from("crm_builtin_tables").upsert({ equipe_id: team, slug, enabled });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  return { enabled: BUILTIN_TABLES.filter(slug => !data?.some(r => r.slug === slug && !r.enabled)), update, isLoading, isError };
}
