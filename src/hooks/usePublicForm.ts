// Sprint 11 · Onda 4 · T45 — the public form of a table's records.
//
// The table chooses the fields (crm_save_form_config); a record gets a link
// (crm_create_form_link — the token comes back only then, the database keeps the
// hash); the drawer shows whether the client answered.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { normalizeFormConfig, publicFormUrl, type FormConfig, type FormLinkRow } from "@/lib/publicForm";

const sb = supabase as any;

export const formLinkKeys = {
  record: (recordId: string | null) => ["custom_record_form_link", recordId] as const,
};

export function useSaveFormConfig(tableId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: FormConfig) => {
      const { data, error } = await sb.rpc("crm_save_form_config", { p_table_id: tableId, p_config: config });
      if (error) throw error;
      return normalizeFormConfig(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom_tables"] });
      toast.success("Formulário salvo");
    },
    onError: (error: Error) => toast.error("Erro ao salvar o formulário: " + error.message),
  });
}

/** The record's latest link (the one that counts). */
export function useRecordFormLink(recordId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: formLinkKeys.record(recordId),
    enabled: enabled && !!recordId,
    queryFn: async (): Promise<FormLinkRow | null> => {
      const { data, error } = await sb
        .from("custom_record_form_links")
        .select("created_at, expires_at, submitted_at, revoked_at")
        .eq("record_id", recordId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FormLinkRow | null) ?? null;
    },
  });
}

/** A new link for the record (the old one stops working), copied to the clipboard. */
export function useCreateFormLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordId: string) => {
      const { data, error } = await sb.rpc("crm_create_form_link", { p_record_id: recordId });
      if (error) throw error;
      const url = publicFormUrl(window.location.origin, (data as { token: string }).token);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
      return { url, copied };
    },
    onSuccess: ({ copied }, recordId) => {
      void queryClient.invalidateQueries({ queryKey: formLinkKeys.record(recordId) });
      if (copied) toast.success("Link copiado. Mande para o cliente preencher.");
    },
    onError: (error: Error) => toast.error("Não foi possível gerar o link: " + error.message),
  });
}
