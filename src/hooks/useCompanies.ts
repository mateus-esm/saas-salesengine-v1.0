import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  Company,
  CreateCompanyData,
  UpdateCompanyData,
} from "@/types/crm";

// Sprint 4 EPIC 1 created the `companies` table; DB types regenerate in a
// follow-up chore commit after deploy. Same escape hatch used by
// useOpportunities / useOpportunityLinks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "companies";

/**
 * Sprint 4 EPIC 4 — tenant-scoped companies. Mirrors the `useOpportunities`
 * shape: list/search query + CRUD mutations + realtime invalidation. Search
 * is an optional in-memory substring filter so consumers don't need to
 * coordinate query keys across variations.
 */
export const useCompanies = (search?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey = ["companies", equipeId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Company[]> => {
      if (!equipeId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    enabled: !!equipeId,
  });

  useEffect(() => {
    if (!equipeId) return;
    const channel = sb
      .channel(`companies_${equipeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `equipe_id=eq.${equipeId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeId, queryClient]);

  const companies = query.data ?? [];

  const filtered = search?.trim()
    ? companies.filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.legal_name ?? "").toLowerCase().includes(q) ||
          (c.cnpj ?? "").toLowerCase().includes(q)
        );
      })
    : companies;

  const createCompany = useMutation({
    mutationFn: async (input: CreateCompanyData): Promise<Company> => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          name: input.name,
          legal_name: input.legal_name ?? null,
          cnpj: input.cnpj ?? null,
          website: input.website ?? null,
          industry: input.industry ?? null,
          size_bracket: input.size_bracket ?? null,
          custom_data: input.custom_data ?? {},
        })
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies", equipeId] });
      toast.success("Empresa criada");
    },
    onError: (e: Error) => toast.error("Erro ao criar empresa: " + e.message),
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateCompanyData): Promise<Company> => {
      const { data, error } = await sb
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies", equipeId] });
    },
    onError: (e: Error) => toast.error("Erro ao atualizar empresa: " + e.message),
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies", equipeId] });
      toast.success("Empresa removida");
    },
    onError: (e: Error) => toast.error("Erro ao remover empresa: " + e.message),
  });

  return {
    companies: filtered,
    allCompanies: companies,
    isLoading: query.isLoading,
    error: query.error,
    createCompany,
    updateCompany,
    deleteCompany,
    refetch: query.refetch,
  };
};

/**
 * Fetch a single company by id without loading the full list. Used by detail
 * drawers / deep-link resolvers.
 */
export const useCompany = (id: string | null | undefined) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["company", id, equipeId],
    queryFn: async (): Promise<Company | null> => {
      if (!id || !equipeId) return null;
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data as Company) ?? null;
    },
    enabled: !!id && !!equipeId,
  });
};
