// FunctionsHttpError.message only contains the HTTP status; the useful error
// returned by an Edge Function is in its response body.
export async function edgeFunctionError(error: { message?: string; context?: unknown }, fallback: string): Promise<Error> {
  const context = error.context as { clone?: () => Response; json?: () => Promise<unknown> } | undefined;
  try {
    const response = typeof context?.clone === "function" ? context.clone() : context;
    const payload = await response?.json?.() as { error?: unknown; message?: unknown } | null;
    const message = payload?.error ?? payload?.message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  } catch {
    // Gateway/network failures may have no JSON response.
  }
  return new Error(error.message || fallback);
}
