// SE-SUP1-2 — códigos de erro que o send-chat-message devolve no corpo (4xx).
// `functions.invoke` entrega um FunctionsHttpError cujo `context` é a Response;
// o código vem no texto de `error` ("meta_window_closed: ...").

export const META_WINDOW_CLOSED = "meta_window_closed";

/** Lê o `error` do corpo JSON da resposta de falha; null se não houver. */
export async function readSendErrorMessage(err: unknown): Promise<string | null> {
  const ctx = (err as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: unknown } | null;
      if (typeof body?.error === "string") return body.error;
    } catch {
      /* corpo não é JSON: cai na mensagem do erro */
    }
  }
  const m = (err as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : null;
}

export function isMetaWindowClosedMessage(message: string | null | undefined): boolean {
  return (message ?? "").trim().startsWith(META_WINDOW_CLOSED);
}
