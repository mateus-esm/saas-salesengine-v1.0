import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { actionsFrom, type ArtifactAction } from "@/lib/artifactActions";
import { isArtifactKind, type ArtifactKind } from "@/lib/artifacts";
import { withFieldIds } from "@/lib/customTables";
import { normalizeFormConfig, type FormConfig } from "@/lib/publicForm";
import { toast } from "sonner";

// custom_tables lags in generated types; scope is enforced via equipe_id + RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Sprint 11 · T21 — the column types of a custom table: the field-type registry's
 * (src/lib/fields/registry.ts) plus the relation to another custom table.
 */
export type CustomTableColumnType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select"
  | "multi_select"
  | "url"
  | "phone"
  | "user"
  /** Sprint 11 · T42 — files in the private bucket `artifacts` (a list in data[field_id]). */
  | "file"
  | "relation"
  /** Sprint 11 · T41 — read-only, read from the deal holding the record (artifact tables). */
  | "lookup";

/** What a lookup column reads from the deal holding the record. */
export type LookupSource =
  | "contact.name"
  | "contact.phone"
  | "contact.email"
  | "deal.value"
  | "deal.stage"
  | "deal.owner"
  | "deal.items";

export interface CustomTableColumn {
  /**
   * Sprint 11 · T39 — the column's address, never changed: records keep their
   * values under data[field_id]. (withFieldIds fills it with the key for a column
   * read before the conversion.)
   */
  field_id: string;
  /** Born from the label (uniqueKey) and never edited: the public name at the edges (payload, form). */
  key: string;
  label: string;
  type: CustomTableColumnType;
  /** Only for select / multi_select. */
  options?: string[];
  /** Removed from the table; its values stay stored and its key is never reused. */
  is_deleted?: boolean;
  relationConfig?: {
    targetTable: string;
    targetTableSlug: string;
    /** UUID of the target custom table (used to query custom_table_records). */
    targetTableId?: string;
    /** The field_id of the target column that names a linked record. */
    displayField: string;
  };
  /** Only for lookup: resolved by the server when the row is read, never stored. */
  lookupConfig?: { source: LookupSource };
}

export interface CustomTable {
  id: string;
  equipe_id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  table_schema: CustomTableColumn[];
  /** Sprint 11 · T40 — a table of artifacts: its records are held by a deal. */
  artifact_kind: ArtifactKind | null;
  /** Sprint 11 · T44 — the automation buttons (the URL lives in the webhook, not here). */
  actions: ArtifactAction[];
  /** Sprint 11 · T45 — the public form each record can send to the client. */
  form_config: FormConfig | null;
  created_at: string;
  updated_at: string;
}

interface CreateCustomTableData {
  name: string;
  slug: string;
  icon?: string | null;
  description?: string | null;
  table_schema?: CustomTableColumn[];
  artifact_kind?: ArtifactKind | null;
}

interface UpdateCustomTableData {
  id: string;
  name?: string;
  slug?: string;
  icon?: string | null;
  description?: string | null;
  table_schema?: CustomTableColumn[];
}

/**
 * Sprint 5.3 T15 — Personalized Tables foundation.
 *
 * CRUD over `custom_tables` (team-scoped metadata for Jestor/Airtable-style
 * custom table definitions). No builder UI yet — this hook is the data layer
 * future sprints will drive the visual schema editor from.
 */
export const useCustomTables = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const tablesQuery = useQuery({
    queryKey: ["custom_tables", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<CustomTable[]> => {
      const { data, error } = await sb
        .from("custom_tables")
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        table_schema: withFieldIds(r.table_schema),
        artifact_kind: isArtifactKind(r.artifact_kind) ? r.artifact_kind : null,
        actions: actionsFrom(r.actions),
        form_config: normalizeFormConfig(r.form_config),
      })) as CustomTable[];
    },
  });

  const createTable = useMutation({
    mutationFn: async (input: CreateCustomTableData) => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from("custom_tables")
        .insert({
          equipe_id: equipeId,
          name: input.name,
          slug: input.slug,
          icon: input.icon ?? null,
          description: input.description ?? null,
          table_schema: input.table_schema ?? [],
          ...(input.artifact_kind ? { artifact_kind: input.artifact_kind } : {}),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_tables", equipeId] });
      toast.success("Tabela criada");
    },
    onError: (error: Error) => toast.error("Erro ao criar tabela: " + error.message),
  });

  const updateTable = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateCustomTableData) => {
      const { data, error } = await sb
        .from("custom_tables")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_tables", equipeId] });
      toast.success("Tabela atualizada");
    },
    onError: (error: Error) => toast.error("Erro ao atualizar tabela: " + error.message),
  });

  // Soft delete — keeps records and respects the partial unique index on slug.
  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("custom_tables")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_tables", equipeId] });
      toast.success("Tabela removida");
    },
    onError: (error: Error) => toast.error("Erro ao remover tabela: " + error.message),
  });

  return {
    tables: tablesQuery.data ?? [],
    isLoading: tablesQuery.isLoading,
    error: tablesQuery.error,
    createTable,
    updateTable,
    deleteTable,
    refetch: tablesQuery.refetch,
  };
};
