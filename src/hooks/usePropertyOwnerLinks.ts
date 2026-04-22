import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  PropertyOwnerLink,
  PropertyOwnerType,
} from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "property_owner_links";

type Scope =
  | { by: "property"; id: string | null | undefined }
  | { by: "owner"; ownerType: PropertyOwnerType; id: string | null | undefined };

/**
 * Sprint 4 EPIC 4 — polymorphic property ownership. A property may be owned
 * by contacts and/or companies; `owner_type` discriminates. Query by property
 * (from the property drawer) or by owner (from company / contact drawers).
 */
export const usePropertyOwnerLinks = (scope: Scope) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey =
    scope.by === "property"
      ? ["property_owner_links", "property", scope.id, equipeId]
      : ["property_owner_links", "owner", scope.ownerType, scope.id, equipeId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PropertyOwnerLink[]> => {
      if (!scope.id || !equipeId) return [];

      let q = sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);

      if (scope.by === "property") {
        q = q.eq("property_id", scope.id);
      } else {
        q = q.eq("owner_type", scope.ownerType).eq("owner_id", scope.id);
      }

      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PropertyOwnerLink[];
    },
    enabled: !!scope.id && !!equipeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["property_owner_links"] });
  };

  const link = useMutation({
    mutationFn: async (input: {
      property_id: string;
      owner_type: PropertyOwnerType;
      owner_id: string;
    }): Promise<PropertyOwnerLink> => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          property_id: input.property_id,
          owner_type: input.owner_type,
          owner_id: input.owner_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PropertyOwnerLink;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Propriedade vinculada");
    },
    onError: (e: Error) => toast.error("Erro ao vincular propriedade: " + e.message),
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

  return {
    links: query.data ?? [],
    isLoading: query.isLoading,
    link,
    unlink,
  };
};
