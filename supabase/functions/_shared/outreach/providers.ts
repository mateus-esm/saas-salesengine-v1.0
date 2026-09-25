export type ProviderId = "gptmaker" | "solo";
export type DeliveryOutcome = "sent" | "rejected" | "unreachable" | "unknown";

export interface OutreachLine {
  provider: ProviderId;
  ref: string;
  lineId: string;
  key: string;
  channelType?: string | null;
}

export interface DeliveryResult {
  outcome: DeliveryOutcome;
  retryable: boolean;
  errorCode?: string;
  errorMessage?: string;
  providerStatus: number | null;
  providerBody: unknown;
  providerMessageId: string | null;
  providerChatId: string | null;
}

export interface OutreachSettings {
  provider: ProviderId;
  channel_id: string | null;
  solo_instance_id: string | null;
}

export interface ResolveCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  equipeId: string;
  settings: OutreachSettings;
}

export type ResolveLineResult =
  | { line: OutreachLine }
  | { errorCode: string; detail: string };

export interface OutreachProvider {
  id: ProviderId;
  resolveLine(ctx: ResolveCtx): Promise<ResolveLineResult>;
  deliver(
    line: OutreachLine,
    req: { phone: string; text: string },
  ): Promise<DeliveryResult>;
}
