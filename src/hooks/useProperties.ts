import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  Property,
  CreatePropertyData,
  UpdatePropertyData,
} from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "properties";

/**
 * Sprint 4 EPIC 4 — tenant-scoped properties (sites, units, addresses).
 * Same shape as useCompanies; properties are never a top-level tab — they're
 * surfaced inside Company / Contact / Opportunity drawers via PropertySection.
 */
export const useProperties = (search?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey = ["properties", equipeId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Property[]> => {
      if (!equipeId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Property[];
    },
    enabled: !!equipeId,
  });

  useEffect(() => {
    if (!equipeId) return;
    const channel = sb
      .channel(`properties_${equipeId}`)
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

  const properties = query.data ?? [];

  const filtered = search?.trim()
    ? properties.filter((p) => {
        const q = search.trim().toLowerCase();
        return p.label.toLowerCase().includes(q);
      })
    : properties;

  const createProperty = useMutation({
    mutationFn: async (input: CreatePropertyData): Promise<Property> => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          label: input.label,
          property_type: input.property_type ?? "address",
          address: input.address ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          attributes: input.attributes ?? {},
        })
        .select()
        .single();
      if (error) throw error;
      return data as Property;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties", equipeId] });
      toast.success("Propriedade criada");
    },
    onError: (e: Error) => toast.error("Erro ao criar propriedade: " + e.message),
  });

  const updateProperty = useMutation({
    mutationFn: async ({ id, ...patch }: UpdatePropertyData): Promise<Property> => {
      const { data, error } = await sb
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Property;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties", equipeId] });
    },
    onError: (e: Error) => toast.error("Erro ao atualizar propriedade: " + e.message),
  });

  const deleteProperty = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties", equipeId] });
      toast.success("Propriedade removida");
    },
    onError: (e: Error) => toast.error("Erro ao remover propriedade: " + e.message),
  });

  return {
    properties: filtered,
    allProperties: properties,
    isLoading: query.isLoading,
    error: query.error,
    createProperty,
    updateProperty,
    deleteProperty,
    refetch: query.refetch,
  };
};

export const useProperty = (id: string | null | undefined) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["property", id, equipeId],
    queryFn: async (): Promise<Property | null> => {
      if (!id || !equipeId) return null;
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data as Property) ?? null;
    },
    enabled: !!id && !!equipeId,
  });
};
