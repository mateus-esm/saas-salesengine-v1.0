import { isTechnicalPhone, normalizePhone } from "../phone.ts";
import { renderFirstMessage } from "../start-conversation.ts";
import type {
  DeliveryResult,
  OutreachLine,
  OutreachProvider,
  OutreachSettings,
} from "./providers.ts";
import { getOutreachProvider } from "./router.ts";
import { nextAllowedSendTime } from "./schedule.ts";

export type OutreachJob = {
  id: string;
  equipe_id: string;
  enrollment_id: string;
  step_id: string | null;
  step_position: number;
  lead_id: string;
};

export type JobContext = {
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    source: string | null;
  };
  enrollment: { id: string; sequence_id: string };
  step: { message_template: string };
  settings: OutreachSettings & {
    send_window_start: string;
    send_window_end: string;
    timezone: string;
    max_sends_per_line_hour: number;
  };
  tenant: { name: string | null };
};

export type FinishStatus = "sent" | "failed" | "skipped" | "unknown";

export interface WorkerDependencies {
  // Cliente service-role usado apenas pelos resolvedores de linha.
  supabase?: unknown;
  claim(limit: number): Promise<OutreachJob[]>;
  loadContext(job: OutreachJob): Promise<JobContext>;
  isSuspended(equipeId: string): Promise<boolean>;
  lineUsage(lineKey: string): Promise<number>;
  defer(jobId: string, until: Date, reason: string): Promise<void>;
  finish(
    jobId: string,
    status: FinishStatus,
    error: string | null,
    result: Record<string, unknown> | null,
    retryable: boolean,
  ): Promise<void>;
  persist(
    job: OutreachJob,
    context: JobContext,
    text: string,
    line: OutreachLine,
    delivery: DeliveryResult,
  ): Promise<string>;
  provider?(id: OutreachSettings["provider"]): OutreachProvider;
  now?(): Date;
}

function deliveryResult(
  provider: string,
  lineKey: string,
  text: string,
  delivery: DeliveryResult,
  conversationId?: string,
): Record<string, unknown> {
  return {
    provider,
    line_key: lineKey,
    rendered_message: text,
    provider_status: delivery.providerStatus,
    provider_response: delivery.providerBody,
    provider_message_id: delivery.providerMessageId,
    provider_chat_id: delivery.providerChatId,
    conversation_id: conversationId ?? null,
  };
}

export async function processOutreachBatch(
  deps: WorkerDependencies,
  limit = 20,
): Promise<{ claimed: number; processed: number; errors: number }> {
  const jobs = await deps.claim(limit);
  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      const context = await deps.loadContext(job);
      if (await deps.isSuspended(job.equipe_id)) {
        await deps.finish(job.id, "skipped", "contract_suspended", null, false);
        processed++;
        continue;
      }
      if (isTechnicalPhone(context.lead.phone)) {
        await deps.finish(job.id, "skipped", "technical_phone", null, false);
        processed++;
        continue;
      }
      const phone = normalizePhone(context.lead.phone);
      if (!phone) {
        await deps.finish(job.id, "skipped", "missing_phone", null, false);
        processed++;
        continue;
      }

      const now = deps.now?.() ?? new Date();
      const allowedAt = nextAllowedSendTime(now, {
        start: context.settings.send_window_start,
        end: context.settings.send_window_end,
        timezone: context.settings.timezone,
      });
      if (allowedAt.getTime() > now.getTime()) {
        await deps.defer(job.id, allowedAt, "outside_send_window");
        processed++;
        continue;
      }

      const provider = deps.provider?.(context.settings.provider) ??
        getOutreachProvider(context.settings.provider);
      const resolved = await provider.resolveLine({
        supabase: deps.supabase,
        equipeId: job.equipe_id,
        settings: context.settings,
      });
      if ("errorCode" in resolved) {
        await deps.finish(job.id, "failed", resolved.errorCode, null, false);
        processed++;
        continue;
      }
      const line = resolved.line;
      if (
        await deps.lineUsage(line.key) >=
          context.settings.max_sends_per_line_hour
      ) {
        await deps.defer(
          job.id,
          new Date(now.getTime() + 5 * 60_000),
          "line_hour_limit",
        );
        processed++;
        continue;
      }

      const text = renderFirstMessage(context.step.message_template, {
        leadName: context.lead.name,
        leadSource: context.lead.source,
        tenantName: context.tenant.name,
      });
      if (!text) {
        await deps.finish(job.id, "failed", "missing_message", null, false);
        processed++;
        continue;
      }

      const delivery = await provider.deliver(line, { phone, text });
      const result = deliveryResult(provider.id, line.key, text, delivery);
      if (delivery.outcome === "sent") {
        try {
          const conversationId = await deps.persist(
            job,
            context,
            text,
            line,
            delivery,
          );
          await deps.finish(
            job.id,
            "sent",
            null,
            { ...result, conversation_id: conversationId },
            false,
          );
        } catch (error) {
          await deps.finish(
            job.id,
            "unknown",
            `provider aceitou, mas a persistência falhou: ${
              error instanceof Error ? error.message : String(error)
            }`,
            result,
            false,
          );
          errors++;
        }
      } else if (delivery.outcome === "unknown") {
        await deps.finish(
          job.id,
          "unknown",
          delivery.errorMessage ?? delivery.errorCode ?? "delivery_unknown",
          result,
          false,
        );
      } else {
        await deps.finish(
          job.id,
          "failed",
          delivery.errorMessage ?? delivery.errorCode ?? delivery.outcome,
          result,
          delivery.retryable,
        );
      }
      processed++;
    } catch (error) {
      errors++;
      await deps.finish(
        job.id,
        "failed",
        error instanceof Error ? error.message : String(error),
        null,
        false,
      ).catch(() => undefined);
    }
  }
  return { claimed: jobs.length, processed, errors };
}
