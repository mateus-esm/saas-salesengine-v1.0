// ============================================================================
// Sprint 17 — cliente mínimo da Graph API do Meta.
//
// Toda chamada com token leva `appsecret_proof`. Erro do Meta vira
// MetaGraphError (code/subcode do Graph) — a mensagem nunca carrega o token.
// O `fetch` é injetável para os testes.
// ============================================================================

import { appsecretProof, GRAPH_BASE } from "./meta.ts";

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly status?: number,
    readonly type?: string,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Params = Record<string, string | undefined>;

export interface Graph {
  get<T = unknown>(path: string, token: string, params?: Params): Promise<T>;
  post<T = unknown>(path: string, token: string, params?: Params): Promise<T>;
  del<T = unknown>(path: string, token: string, params?: Params): Promise<T>;
  paginate<T = unknown>(path: string, token: string, params?: Params, maxPages?: number): Promise<T[]>;
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  appToken(): string;
}

export function createGraph(o: { appId: string; appSecret: string; fetch?: Fetch; timeoutMs?: number }): Graph {
  const doFetch: Fetch = o.fetch ?? ((i, init) => fetch(i, init));
  const timeout = o.timeoutMs ?? 30_000;

  async function read<T>(res: Response): Promise<T> {
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } } | null)?.error;
    if (!res.ok || err) {
      throw new MetaGraphError(
        String(err?.message ?? `HTTP ${res.status}`).slice(0, 300),
        err?.code,
        err?.error_subcode,
        res.status,
        err?.type,
      );
    }
    return body as T;
  }

  async function authParams(token: string, params: Params = {}): Promise<URLSearchParams> {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, v);
    p.set("access_token", token);
    p.set("appsecret_proof", await appsecretProof(token, o.appSecret));
    return p;
  }

  const url = (path: string) => (path.startsWith("http") ? new URL(path) : new URL(GRAPH_BASE + (path.startsWith("/") ? path : "/" + path)));

  async function viaQuery<T>(method: "GET" | "DELETE", path: string, token: string, params?: Params): Promise<T> {
    const u = url(path);
    for (const [k, v] of await authParams(token, params)) u.searchParams.set(k, v);
    return read<T>(await doFetch(u, { method, signal: AbortSignal.timeout(timeout) }));
  }

  const graph: Graph = {
    get: (path, token, params) => viaQuery("GET", path, token, params),
    del: (path, token, params) => viaQuery("DELETE", path, token, params),
    async post(path, token, params) {
      const body = await authParams(token, params);
      return read(await doFetch(url(path), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(timeout),
      }));
    },
    async paginate<T>(path: string, token: string, params?: Params, maxPages = 10): Promise<T[]> {
      const out: T[] = [];
      let next: string | null = path;
      let first = true;
      for (let i = 0; i < maxPages && next; i++) {
        // `paging.next` já traz os parâmetros (e o token): só trocamos o token/proof pelos nossos.
        const page: { data?: T[]; paging?: { next?: string } } = await viaQuery("GET", next, token, first ? params : undefined);
        first = false;
        out.push(...(page.data ?? []));
        next = page.paging?.next ?? null;
      }
      return out;
    },
    async exchangeCode(code, redirectUri) {
      const u = url("/oauth/access_token");
      u.searchParams.set("client_id", o.appId);
      u.searchParams.set("client_secret", o.appSecret);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("code", code);
      const r = await read<{ access_token?: string }>(await doFetch(u, { signal: AbortSignal.timeout(timeout) }));
      if (!r.access_token) throw new MetaGraphError("O Meta não devolveu o token");
      return r.access_token;
    },
    appToken: () => `${o.appId}|${o.appSecret}`,
  };
  return graph;
}
