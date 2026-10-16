// SE-SUP1-7 (#6) — the team's intake forms (crm_forms): list, save, switch on/off.
// RLS scopes by equipe_id; the trigger _crm_forms_validate refuses a pipeline,
// stage or responsible from another team and a form that cannot make a contact.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { IntakeField } from "@/lib/intakeForms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface IntakeForm {
  id: string;
  equipe_id: string;
  slug: string;
  token: string;
  title: string;
  description: string;
  fields: IntakeField[];
  pipeline_id: string;
  stage_id: string;
  responsible_id: string | null;
  origin_label: string;
  origin_category: string | null;
  is_active: boolean;
  created_at: string;
}

export type IntakeFormDraft = Omit<IntakeForm, "id" | "equipe_id" | "token" | "created_at"> & { id?: string };

const key = (equipeId?: string | null) => ["crm_forms", equipeId] as const;

export function useIntakeForms() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const query = useQuery({
    queryKey: key(equipeId),
    enabled: !!equipeId,
    queryFn: async (): Promise<IntakeForm[]> => {
      const { data, error } = await sb.from("crm_forms").select("*").eq("equipe_id", equipeId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IntakeForm[];
    },
  });

  const save = useMutation({
    mutationFn: async (draft: IntakeFormDraft) => {
      if (!equipeId) throw new Error("No equipe_id");
      const { id, ...row } = draft;
      const q = id
        ? sb.from("crm_forms").update(row).eq("id", id).eq("equipe_id", equipeId)
        : sb.from("crm_forms").insert({ ...row, equipe_id: equipeId });
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data as IntakeForm;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key(equipeId) });
      toast.success("Formulário salvo");
    },
    onError: (error: Error) => toast.error("Erro ao salvar o formulário: " + error.message),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await sb.from("crm_forms").update({ is_active: active }).eq("id", id).eq("equipe_id", equipeId);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key(equipeId) }),
    onError: (error: Error) => toast.error("Erro ao atualizar o formulário: " + error.message),
  });

  return { forms: query.data ?? [], isLoading: query.isLoading, save, setActive };
}
