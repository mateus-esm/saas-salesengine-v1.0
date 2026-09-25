export type DeliveryOutcome = "sent" | "rejected" | "unreachable" | "unknown";

export interface DeliveryClassification {
  outcome: DeliveryOutcome;
  retryable: boolean;
  errorCode?: string;
}

const TRANSIENT_HTTP = new Set([429, 502, 503]);

export function classifyGptMakerResult(input: {
  status: number | null;
  accepted?: boolean;
  error?: unknown;
}): DeliveryClassification {
  const name = input.error instanceof Error
    ? input.error.name.toLowerCase()
    : "";
  const message = input.error instanceof Error
    ? input.error.message.toLowerCase()
    : String(input.error ?? "").toLowerCase();
  if (
    name.includes("abort") || name.includes("timeout") ||
    message.includes("timed out")
  ) {
    return {
      outcome: "unknown",
      retryable: false,
      errorCode: "provider_timeout",
    };
  }
  if (input.status === null) {
    return {
      outcome: "unreachable",
      retryable: true,
      errorCode: "provider_unreachable",
    };
  }
  if (input.status >= 200 && input.status < 300 && input.accepted !== false) {
    return { outcome: "sent", retryable: false };
  }
  if (input.status >= 200 && input.status < 300) {
    return {
      outcome: "rejected",
      retryable: false,
      errorCode: "provider_rejected",
    };
  }
  return {
    outcome: "rejected",
    retryable: TRANSIENT_HTTP.has(input.status),
    errorCode: "provider_rejected",
  };
}

export function classifySoloResult(input: {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string;
}): DeliveryClassification {
  if (input.ok && input.providerMessageId) {
    return { outcome: "sent", retryable: false };
  }
  if (input.ok) {
    return {
      outcome: "unknown",
      retryable: false,
      errorCode: "solo_missing_message_id",
    };
  }

  const error = String(input.error ?? "").toLowerCase();
  if (
    error.includes("abort") || error.includes("timeout") ||
    error.includes("timed out")
  ) {
    return { outcome: "unknown", retryable: false, errorCode: "solo_timeout" };
  }
  const status = Number(error.match(/returned\s+(\d{3})/)?.[1] ?? 0);
  if (status) {
    return {
      outcome: "rejected",
      retryable: TRANSIENT_HTTP.has(status),
      errorCode: "solo_send_failed",
    };
  }
  return {
    outcome: "unreachable",
    retryable: true,
    errorCode: "solo_unreachable",
  };
}
