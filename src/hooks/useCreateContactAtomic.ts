import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { OriginCategory } from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type RelationalLinkKind = "company" | "property";

/**
 * Sprint 5.2 T7 — canonical contact-ledger persistence path.
 *
 * Upserts a company/property relationship onto the ledger tables that
 * Base de Contatos reads (`contact_company_links` / `property_owner_links` via
 * useLeadEntitySummary). Linking inside a pipeline used to write only
 * `opportunity_links`, so the relationship never surfaced in the contacts grid.
 *
 * Idempotent: reactivates a soft-deleted row instead of inserting a duplicate.
 */
export async function linkEntityToContact(params: {
  equipeId: string;
  contactId: string;
  kind: RelationalLinkKind;
  entityId: string;
}): Promise<void> {
  const { equipeId, contactId, kind, entityId } = params;
  const table = kind === "company" ? "contact_company_links" : "property_owner_links";
  const match =
    kind === "company"
      ? { contact_id: contactId, company_id: entityId }
      : { owner_id: contactId, owner_type: "contact", property_id: entityId };

  let existingQuery = sb.from(table).select("id, deleted_at").eq("equipe_id", equipeId);
  for (const [col, val] of Object.entries(match)) {
    existingQuery = existingQuery.eq(col, val);
  }
  const { data: existing } = await existingQuery.limit(1).maybeSingle();

  if (existing?.id) {
    if (existing.deleted_at) {
      const { error } = await sb.from(table).update({ deleted_at: null }).eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  const { error } = await sb.from(table).insert({ equipe_id: equipeId, ...match });
  if (error) throw error;
}

/**
 * Sprint 5.2 T7 — inverse of linkEntityToContact (soft delete).
 * Callers must first confirm no other active link still justifies the
 * relationship before removing it from the contact ledger.
 */
export async function unlinkEntityFromContact(params: {
  equipeId: string;
  contactId: string;
  kind: RelationalLinkKind;
  entityId: string;
}): Promise<void> {
  const { equipeId, contactId, kind, entityId } = params;
  const table = kind === "company" ? "contact_company_links" : "property_owner_links";
  const match =
    kind === "company"
      ? { contact_id: contactId, company_id: entityId }
      : { owner_id: contactId, owner_type: "contact", property_id: entityId };

  let query = sb.from(table).update({ deleted_at: new Date().toISOString() }).eq("equipe_id", equipeId);
  for (const [col, val] of Object.entries(match)) {
    query = query.eq(col, val);
  }
  const { error } = await query.is("deleted_at", null);
  if (error) throw error;
}

interface ContactPayload {
  name: string;
  email?: string;
  phone?: string;
  observations?: string;
  source?: string;
  origin?: string;
  origin_category?: OriginCategory | null;
  origin_detail?: string | null;
}

interface RoutingPayload {
  pipelineId: string;
  stageId?: string | null;
}

export interface CreateContactAtomicInput {
  contact: ContactPayload;
  routing?: RoutingPayload;
}

export interface CreateContactAtomicResult {
  leadId: string;
  opportunityId: string | null;
}

export const useCreateContactAtomic = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  return useMutation({
    mutationFn: async (input: CreateContactAtomicInput): Promise<CreateContactAtomicResult> => {
      if (!equipeId) throw new Error("No equipe_id");

      const { contact, routing } = input;
      const rollbackStamp = new Date().toISOString();

      const { data: lead, error: leadError } = await sb
        .from("leads")
        .insert({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          observations: contact.observations,
          source: contact.source || "Manual",
          origem: contact.source || "Manual",
          origin: contact.origin || "manual",
          origin_category: contact.origin_category ?? null,
          origin_detail: contact.origin_detail ?? null,
          creation_source: "manual",
          lead_type: "lead",
          contact_type: routing ? "opportunity" : "lead",
          equipe_id: equipeId,
          atendido_por_agente: false,
          tags: [],
          custom_fields: {},
        })
        .select("id")
        .single();

      if (leadError) throw leadError;
      const leadId = lead.id as string;

      if (!routing) {
        return { leadId, opportunityId: null };
      }

      try {
        let stageId = routing.stageId || null;
        if (!stageId) {
          const { data: stage, error: stageError } = await sb
            .from("pipeline_stages_v2")
            .select("id")
            .eq("equipe_id", equipeId)
            .eq("pipeline_id", routing.pipelineId)
            .is("deleted_at", null)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (stageError) throw stageError;
          if (!stage) throw new Error("Pipeline nao possui etapas. Crie ao menos uma antes.");
          stageId = stage.id as string;
        }

        const { data: opportunity, error: opportunityError } = await sb
          .from("opportunities")
          .insert({
            equipe_id: equipeId,
            lead_id: leadId,
            pipeline_id: routing.pipelineId,
            stage_id: stageId,
            value: null,
            currency: "BRL",
            custom_data: {},
          })
          .select("id")
          .single();

        if (opportunityError) throw opportunityError;

        return { leadId, opportunityId: opportunity.id as string };
      } catch (error) {
        await sb.from("leads").update({ deleted_at: rollbackStamp }).eq("id", leadId);
        throw error;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
      toast.success(
        result.opportunityId
          ? "Contato criado e adicionado a pipeline!"
          : "Contato criado com sucesso!",
      );
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar contato: " + error.message);
    },
  });
};
