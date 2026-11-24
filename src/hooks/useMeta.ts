// Sprint 17 — Integração nativa com o Meta (edge integrations-meta).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { MetaStatus } from "@/lib/meta";

export const metaKeys = { status: ["integrations", "meta", "status"] as const };

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
    mutationFn: async () => (await callMeta<{ url: string }>({ action: "start" })).url,
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

  return { status, start, rediscover, probe, disconnect };
}
