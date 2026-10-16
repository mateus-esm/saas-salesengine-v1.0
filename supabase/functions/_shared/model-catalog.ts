// ============================================================================
// Sprint Suporte 1 · Onda 9 (#2) — catálogo de modelos de IA.
//
// O provedor é quem sabe quais modelos existem; `MODEL_CATALOG` (em
// manage-agent-settings) virou só a tabela de preço/rótulo. Este módulo é a
// parte pura da junção: sem rede, sem banco, para poder ser testada.
//
// Regras (plano, Onda 9):
//   - modelo listado pelo provedor e sem preço nosso: aparece como "novo", com
//     preço provisório = o maior crédito do mesmo fornecedor. NUNCA 0 — um
//     modelo grátis por engano é prejuízo silencioso.
//   - modelo que sumiu do provedor segue visível se algum agente o usa, com aviso.
//   - o cache vale 6 h; "Atualizar lista" força, mas não mais que 1x por minuto.
// ============================================================================
import type { ModelInfo, PublicModel } from "./credit-pricing.ts";
import { toBilledCredits } from "./credit-pricing.ts";

export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
/** Piso entre dois refresh forçados: o botão não pode virar um martelo no provedor. */
export const FORCE_MIN_INTERVAL_MS = 60 * 1000;
/** Último recurso quando não há nenhum preço conhecido (catálogo local vazio). */
const FALLBACK_PROVIDER_CREDITS = 10;

export interface ProviderModel {
  id: string;
  label?: string;
  vendor?: string;
}

export interface CatalogEntry extends PublicModel {
  /** Preço inferido, não confirmado: o modelo existe no provedor mas não está na nossa tabela. */
  provisionalPrice?: boolean;
  /** O provedor não lista mais, mas algum agente ainda usa. */
  unlisted?: boolean;
}

const ID_RE = /^[A-Za-z0-9_.\-]{2,60}$/;

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * Tolerante ao formato: o endpoint de lista não está nos docs publicados
 * (sonda pendente), então aceita array puro ou embrulhado em data/models/items/
 * results, e item como string ou objeto com id|model|value|slug|name.
 * Ids fora do padrão que `update-model` aceita são descartados — não adianta
 * oferecer ao cliente algo que a gravação recusaria.
 */
export function parseProviderModels(payload: unknown): ProviderModel[] {
  let list: unknown = payload;
  if (!Array.isArray(list) && list && typeof list === "object") {
    const o = list as Record<string, unknown>;
    list = o.data ?? o.models ?? o.items ?? o.results ?? [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ProviderModel[] = [];
  for (const item of list) {
    let id: string | undefined;
    let label: string | undefined;
    let vendor: string | undefined;
    if (typeof item === "string") {
      id = asString(item);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      id = asString(o.id) ?? asString(o.model) ?? asString(o.value) ?? asString(o.slug) ?? asString(o.name);
      label = asString(o.label) ?? asString(o.displayName) ?? asString(o.title);
      vendor = asString(o.vendor) ?? asString(o.provider) ?? asString(o.company);
    }
    if (!id || !ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, ...(label ? { label } : {}), ...(vendor ? { vendor } : {}) });
  }
  return out;
}

/** Fornecedor de um id desconhecido, pelo prefixo da grafia do provedor. */
export function inferVendor(id: string): string {
  const u = id.toUpperCase();
  if (/^(GPT|OPEN_AI|OPENAI|O\d)/.test(u)) return "OpenAI";
  if (u.startsWith("CLAUDE")) return "Anthropic";
  if (u.includes("LLAMA")) return "Meta";
  if (u.startsWith("QWEN")) return "Alibaba";
  if (u.startsWith("DEEPSEEK")) return "Deepseek";
  if (u.startsWith("SABIA")) return "Maritaca";
  if (u.startsWith("GEMINI")) return "Google";
  return "Outros";
}

/** "GPT_5_7_LUNA" -> "GPT 5 7 LUNA": feio, mas honesto — o admin renomeia ao precificar. */
const labelFromId = (id: string): string => id.replace(/_/g, " ");

/**
 * Preço provisório: o maior crédito do mesmo fornecedor; sem referência do
 * fornecedor, o maior de todos; sem nada, uma constante > 0. Nunca 0.
 */
export function provisionalCredits(vendor: string, local: ModelInfo[]): number {
  const max = (xs: ModelInfo[]) => xs.reduce((m, x) => Math.max(m, x.providerCredits || 0), 0);
  const same = max(local.filter((m) => m.vendor === vendor));
  if (same > 0) return same;
  const any = max(local);
  return any > 0 ? any : FALLBACK_PROVIDER_CREDITS;
}

export interface MergeInput {
  local: ModelInfo[];
  /** null = não há lista do provedor nem cache (cai no catálogo local inteiro). */
  provider: ProviderModel[] | null;
  /** Modelos que algum agente da equipe usa hoje (prefferModel). */
  inUse: string[];
}

export interface MergeResult {
  models: CatalogEntry[];
  /** Ids listados pelo provedor sem preço nosso: o que pede alerta ao admin. */
  unpriced: string[];
}

function fromLocal(m: ModelInfo, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: m.id,
    label: m.label,
    vendor: m.vendor,
    creditsPerMessage: toBilledCredits(m.providerCredits),
    ...(m.isNew ? { isNew: true } : {}),
    ...(m.isBeta ? { isBeta: true } : {}),
    ...(m.unverifiedPrice ? { unverifiedPrice: true } : {}),
    ...extra,
  };
}

export function mergeCatalog({ local, provider, inUse }: MergeInput): MergeResult {
  if (provider === null) {
    return { models: local.map((m) => fromLocal(m)), unpriced: [] };
  }
  const byId = new Map(local.map((m) => [m.id, m]));
  const models: CatalogEntry[] = [];
  const unpriced: string[] = [];
  const listed = new Set<string>();

  for (const p of provider) {
    listed.add(p.id);
    const known = byId.get(p.id);
    if (known) {
      models.push(fromLocal(known));
      continue;
    }
    const vendor = p.vendor ?? inferVendor(p.id);
    models.push({
      id: p.id,
      label: p.label ?? labelFromId(p.id),
      vendor,
      creditsPerMessage: toBilledCredits(provisionalCredits(vendor, local)),
      isNew: true,
      provisionalPrice: true,
    });
    unpriced.push(p.id);
  }

  // Sumiu do provedor mas alguém ainda usa: some só para quem não depende dele.
  for (const id of inUse) {
    if (!id || listed.has(id)) continue;
    const known = byId.get(id);
    if (known) {
      models.push(fromLocal(known, { unlisted: true }));
    } else {
      const vendor = inferVendor(id);
      models.push({
        id,
        label: labelFromId(id),
        vendor,
        creditsPerMessage: toBilledCredits(provisionalCredits(vendor, local)),
        provisionalPrice: true,
        unlisted: true,
      });
    }
  }
  return { models, unpriced };
}

export type RefreshDecision = "serve-cache" | "refresh";

/**
 * Refresh interno quando o cache venceu (ou não existe); forçado pelo botão,
 * mas só se o último refresh tiver mais que FORCE_MIN_INTERVAL_MS.
 */
export function decideRefresh(
  syncedAt: number | null, now: number, force: boolean,
): RefreshDecision {
  if (syncedAt === null) return "refresh";
  const age = now - syncedAt;
  if (force) return age >= FORCE_MIN_INTERVAL_MS ? "refresh" : "serve-cache";
  return age >= CATALOG_TTL_MS ? "refresh" : "serve-cache";
}
