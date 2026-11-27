// Sprint 17 — Integração nativa com o Meta (edge integrations-meta).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { CapiConfig, CapiMapping, MetaForm, MetaStatus } from "@/lib/meta";

export const metaKeys = {
  status: ["integrations", "meta", "status"] as const,
  forms: ["integrations", "meta", "forms"] as const,
  capi: ["integrations", "meta", "capi"] as const,
};

export async function callMeta<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("integrations-meta", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      }
    } catch {
      /* mantém a mensagem genérica */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useMetaIntegration() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: metaKeys.status });
  const status = useQuery({
    queryKey: metaKeys.status,
    queryFn: () => callMeta<MetaStatus>({ action: "status" }),
  });

  /** Vai para o diálogo do Meta; ele volta em /integracoes/meta/callback. */
  const start = useMutation({
    // `origin`: vai no state; a volta (rev.) repassa para este domínio de nicho (sessão é por domínio).
    mutationFn: async () => (await callMeta<{ url: string }>({ action: "start", origin: window.location.origin })).url,
    onSuccess: (url) => window.location.assign(url),
    onError: (e: Error) => toast.error(e.message),
  });
  const rediscover = useMutation({
    mutationFn: () => callMeta<MetaStatus>({ action: "rediscover" }),
    onSuccess: () => {
      refresh();
      toast.success("Ativos do Meta atualizados");
    },
    onError: (e: Error) => {
      refresh();
      toast.error(e.message);
    },
  });
  const probe = useMutation({
    mutationFn: () => callMeta<Record<string, unknown>>({ action: "probe" }),
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: () => callMeta({ action: "disconnect" }),
    onSuccess: () => {
      refresh();
      toast.success("Meta desconectado — os tokens foram apagados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pageToggle = useMutation({
    mutationFn: (v: { assetId: string; on: boolean }) =>
      callMeta<MetaStatus & { forms_found?: number; forms_warning?: string | null }>({
        action: v.on ? "activate_page" : "deactivate_page",
        asset_id: v.assetId,
      }),
    onSuccess: (r, v) => {
      qc.setQueryData(metaKeys.status, r);
      qc.invalidateQueries({ queryKey: metaKeys.forms });
      if (v.on) {
        toast.success(
          r.forms_warning
            ? `Página recebendo leads. ${r.forms_warning}`
            : `Página recebendo leads${r.forms_found ? ` · ${r.forms_found} formulário(s) encontrados` : ""}`,
        );
      } else toast.success("Página não recebe mais leads");
    },
    onError: (e: Error) => {
      refresh();
      toast.error(e.message);
    },
  });
  const retryFailed = useMutation({
    mutationFn: () => callMeta<MetaStatus & { retried: number }>({ action: "retry_failed" }),
    onSuccess: (r) => {
      qc.setQueryData(metaKeys.status, r);
      toast.success(r.retried ? `${r.retried} lead(s) de volta à fila` : "Nada para tentar de novo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { status, start, rediscover, probe, disconnect, pageToggle, retryFailed };
}

export function useMetaForms(enabled: boolean) {
  const qc = useQueryClient();
  const forms = useQuery({
    queryKey: metaKeys.forms,
    queryFn: async () => (await callMeta<{ forms: MetaForm[] }>({ action: "forms" })).forms,
    enabled,
  });
  const refreshForms = useMutation({
    mutationFn: async () => (await callMeta<{ forms: MetaForm[] }>({ action: "forms", refresh: true })).forms,
    onSuccess: (f) => qc.setQueryData(metaKeys.forms, f),
    onError: (e: Error) => toast.error(e.message),
  });
  const importRecent = useMutation({
    mutationFn: (v: { formId: string; days: number }) =>
      callMeta<{ found: number; queued: number; already: number; days: number }>({ action: "import_recent", form_id: v.formId, days: v.days }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: metaKeys.status });
      qc.invalidateQueries({ queryKey: metaKeys.forms });
      toast.success(
        r.found
          ? `${r.found} lead(s) nos últimos ${r.days} dias · ${r.queued} entrando no Rev${r.already ? ` · ${r.already} já estavam` : ""}`
          : `Nenhum lead nos últimos ${r.days} dias`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { forms, refreshForms, importRecent };
}

export function useMetaCapi(enabled: boolean) {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: metaKeys.capi,
    queryFn: () => callMeta<CapiConfig>({ action: "capi_config" }),
    enabled,
  });
  const save = useMutation({
    mutationFn: (patch: { dataset_id?: string | null; capi_enabled?: boolean; mappings?: CapiMapping[] }) =>
      callMeta({ action: "capi_save", ...patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: metaKeys.capi });
      qc.invalidateQueries({ queryKey: metaKeys.status });
      toast.success("API de Conversões salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: (code: string) =>
      callMeta<{ ok: boolean; events_received: number | null; fbtrace_id: string | null }>({ action: "capi_test", test_event_code: code }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: metaKeys.capi });
      toast.success(`Evento de teste enviado (${r.events_received ?? 0} recebido). Veja em Gerenciador de Eventos › Testar eventos.`);
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: metaKeys.capi });
      toast.error(e.message);
    },
  });
  return { config, save, test };
}
