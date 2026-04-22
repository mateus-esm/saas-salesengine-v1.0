import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  ContactCompanyLink,
  ContactCompanyRole,
} from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "contact_company_links";

type Scope =
  | { by: "contact"; id: string | null | undefined }
  | { by: "company"; id: string | null | undefined };

/**
 * Sprint 4 EPIC 4 — many-to-many contact↔company with role and is_primary
 * flag. Query by contact_id (inside ContactDetailsModal) OR by company_id
 * (inside CompanyDetailModal). Primary-key triplet is (contact_id, company_id,
 * role), so the same pair can coexist in different roles (e.g. owner + former).
 */
export const useContactCompanyLinks = (scope: Scope) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey = ["contact_company_links", scope.by, scope.id, equipeId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ContactCompanyLink[]> => {
      if (!scope.id || !equipeId) return [];
      const column = scope.by === "contact" ? "contact_id" : "company_id";
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq(column, scope.id)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContactCompanyLink[];
    },
    enabled: !!scope.id && !!equipeId,
  });

  const invalidate = () => {
    // Invalidate both scopes so the contact drawer and company drawer stay
    // consistent when one side mutates.
    queryClient.invalidateQueries({ queryKey: ["contact_company_links"] });
  };

  const link = useMutation({
    mutationFn: async (input: {
      contact_id: string;
      company_id: string;
      role?: ContactCompanyRole;
      is_primary?: boolean;
    }): Promise<ContactCompanyLink> => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          contact_id: input.contact_id,
          company_id: input.company_id,
          role: input.role ?? "employee",
          is_primary: input.is_primary ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ContactCompanyLink;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Vinculação criada");
    },
    onError: (e: Error) => toast.error("Erro ao vincular: " + e.message),
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Vinculação removida");
    },
    onError: (e: Error) => toast.error("Erro ao remover vínculo: " + e.message),
  });

  const updateRole = useMutation({
    mutationFn: async (input: {
      id: string;
      role: ContactCompanyRole;
    }): Promise<ContactCompanyLink> => {
      const { data, error } = await sb
        .from(TABLE)
        .update({ role: input.role })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as ContactCompanyLink;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro ao atualizar papel: " + e.message),
  });

  /**
   * Mark one link as primary. is_primary is advisory (we don't enforce a
   * single-primary constraint in SQL); this helper clears the flag on sibling
   * links so the UI surfaces a single "main" affiliation per contact.
   */
  const setPrimary = useMutation({
    mutationFn: async (input: { id: string; contact_id: string }) => {
      if (!equipeId) throw new Error("No equipe_id");
      // 1. Clear sibling primary flags on the same contact.
      const { error: clearErr } = await sb
        .from(TABLE)
        .update({ is_primary: false })
        .eq("contact_id", input.contact_id)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);
      if (clearErr) throw clearErr;
      // 2. Set the target link as primary.
      const { error: setErr } = await sb
        .from(TABLE)
        .update({ is_primary: true })
        .eq("id", input.id);
      if (setErr) throw setErr;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro ao definir primária: " + e.message),
  });

  return {
    links: query.data ?? [],
    isLoading: query.isLoading,
    link,
    unlink,
    updateRole,
    setPrimary,
  };
};
