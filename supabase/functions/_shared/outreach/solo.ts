import { sendViaSolo } from "../solo-sender.ts";
import { classifySoloResult } from "./classify.ts";
import type {
  DeliveryResult,
  OutreachLine,
  OutreachProvider,
  ResolveCtx,
  ResolveLineResult,
} from "./providers.ts";

type Instance = {
  id: string;
  equipe_id: string;
  instance_name: string;
  status: string;
};

async function resolveSoloLine(ctx: ResolveCtx): Promise<ResolveLineResult> {
  let instance: Instance;
  if (ctx.settings.solo_instance_id) {
    const { data, error } = await ctx.supabase
      .from("wpp_instances")
      .select("id, equipe_id, instance_name, status")
      .eq("id", ctx.settings.solo_instance_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        errorCode: "line_not_found",
        detail: "Instância Solo configurada não existe.",
      };
    }
    if (data.equipe_id !== ctx.equipeId) {
      return {
        errorCode: "line_other_team",
        detail: "Instância Solo pertence a outra equipe.",
      };
    }
    instance = data as Instance;
  } else {
    const { data, error } = await ctx.supabase
      .from("wpp_instances")
      .select("id, equipe_id, instance_name, status")
      .eq("equipe_id", ctx.equipeId)
      .eq("status", "connected")
      .limit(2);
    if (error) throw error;
    if (!data?.length) {
      return {
        errorCode: "line_not_found",
        detail: "Nenhuma instância Solo conectada.",
      };
    }
    if (data.length > 1) {
      return {
        errorCode: "line_ambiguous",
        detail: "Há mais de uma instância Solo conectada; escolha a linha.",
      };
    }
    instance = data[0] as Instance;
  }
  if (instance.status !== "connected") {
    return {
      errorCode: "line_not_connected",
      detail: "A instância Solo escolhida não está conectada.",
    };
  }
  return {
    line: {
      provider: "solo",
      ref: instance.instance_name,
      lineId: instance.id,
      key: `solo:${instance.id}`,
    },
  };
}

async function deliverSolo(
  line: OutreachLine,
  req: { phone: string; text: string },
): Promise<DeliveryResult> {
  const result = await sendViaSolo({
    // O sender carrega este campo por compatibilidade, mas não o lê.
    supabase: undefined,
    equipeId: null,
    instanceName: line.ref,
    phone: req.phone,
    content: req.text,
  });
  const classification = classifySoloResult({
    ok: result.ok,
    providerMessageId: result.providerMessageId,
    error: result.error,
  });
  return {
    ...classification,
    errorMessage: result.error,
    providerStatus: null,
    providerBody: result.error
      ? { error: result.error }
      : { provider_message_id: result.providerMessageId },
    providerMessageId: result.providerMessageId ?? null,
    providerChatId: null,
  };
}

export const soloProvider: OutreachProvider = {
  id: "solo",
  resolveLine: resolveSoloLine,
  deliver: deliverSolo,
};
