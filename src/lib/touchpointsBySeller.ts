// SE-SUP1-5 (#13) — a forma do que get_touchpoints_by_seller devolve e a
// aritmética de exibição, fora do componente para ser testada.

export interface TouchpointSellerRow {
  seller_id: string | null;
  seller_name: string | null;
  touchpoints: number;
}

export interface TouchpointsBySeller {
  total: number;
  rows: TouchpointSellerRow[];
}

/** Resposta do RPC → forma segura. Nulo/ausente vira zero explícito, nunca erro. */
export function normalizeTouchpoints(raw: unknown): TouchpointsBySeller {
  const r = (raw ?? {}) as { total?: unknown; rows?: unknown };
  const rows = (Array.isArray(r.rows) ? r.rows : []).map((x: Partial<TouchpointSellerRow>) => ({
    seller_id: x.seller_id ?? null,
    seller_name: x.seller_name?.trim() || null,
    touchpoints: Number(x.touchpoints) || 0,
  }));
  const total = Number(r.total);
  return { total: Number.isFinite(total) ? total : rows.reduce((s, x) => s + x.touchpoints, 0), rows };
}

/** Largura da barra, 0–100, relativa ao MAIOR vendedor (não ao total). */
export function barPercent(n: number, rows: TouchpointSellerRow[]): number {
  const max = Math.max(0, ...rows.map((r) => r.touchpoints));
  return max > 0 ? Math.round((n / max) * 100) : 0;
}

export const sellerLabel = (r: TouchpointSellerRow): string => r.seller_name ?? "Não atribuído";
