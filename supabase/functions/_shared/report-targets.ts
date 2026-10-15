// ============================================================================
// SE-SUP1-5 (#15) — a meta diária do relatório.
//
// A meta diária NÃO existia: o gestor só digita meta do PERÍODO (goal_deals /
// goal_revenue, mês ou trimestre) em pipelines.revenue_config. Agora ela mora
// em revenue_config.daily_targets, por marco, e o gestor sobrescreve onde
// quiser. Onde ele não escreveu nada, derivamos: meta do período ÷ dias úteis
// do período. Só fechamentos e receita têm meta de período, então só esses dois
// têm derivação; os outros marcos sem meta digitada ficam "sem meta" — inventar
// um número aqui seria o relatório cobrando o time de uma meta que ninguém pôs.
//
// Puro de propósito (sem I/O): o snapshot do banco entrega os insumos crus
// (revenue_config por pipeline e a contagem de dias úteis) e a aritmética fica
// aqui, testada. Feriados não entram — contamos segunda a sexta.
//
// O front não precisa deste módulo: o relatório é montado inteiro no servidor.
// ============================================================================

export const TARGET_KEYS = [
  "touchpoints",
  "qualified",
  "proposals_sent",
  "meetings_scheduled",
  "meetings_done",
  "deals_won",
  "revenue",
] as const;

export type TargetKey = (typeof TARGET_KEYS)[number];

export interface PipelineGoals {
  pipeline_id?: string;
  name?: string | null;
  /** revenue_config.period: "month" (padrão) ou "quarter". */
  period?: string | null;
  /** Crus do jsonb: podem vir número, string ou lixo. */
  goal_deals?: unknown;
  goal_revenue?: unknown;
  daily_targets?: unknown;
}

export interface GoalsInput {
  /** Dias úteis dentro da janela do relatório. */
  window_business_days?: number | null;
  month_business_days?: number | null;
  quarter_business_days?: number | null;
  pipelines?: PipelineGoals[] | null;
}

export type DailyTargets = Partial<Record<TargetKey, number>>;

export interface ResolvedTargets {
  /** Meta por dia útil, somada nos pipelines do relatório. Ausente = sem meta. */
  daily: DailyTargets;
  /** Meta para a janela inteira (diária × dias úteis da janela). */
  window: DailyTargets;
  /** Marcos cuja meta veio da derivação (não foi digitada). */
  derived: TargetKey[];
  window_business_days: number;
}

/** Número finito >= 0, ou null. "12" e "12,5" (digitado no form) valem. */
export function toTarget(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function resolveDailyTargets(goals: GoalsInput | null | undefined): ResolvedTargets {
  const windowBd = Math.max(0, Number(goals?.window_business_days) || 0);
  const daily: DailyTargets = {};
  const derived = new Set<TargetKey>();

  for (const p of goals?.pipelines ?? []) {
    const explicit =
      p.daily_targets && typeof p.daily_targets === "object"
        ? (p.daily_targets as Record<string, unknown>)
        : {};
    const periodBd = Math.max(
      0,
      Number(p.period === "quarter" ? goals?.quarter_business_days : goals?.month_business_days) || 0,
    );

    for (const key of TARGET_KEYS) {
      let value = toTarget(explicit[key]);
      if (value === null && periodBd > 0) {
        const goal =
          key === "deals_won" ? toTarget(p.goal_deals) : key === "revenue" ? toTarget(p.goal_revenue) : null;
        // Meta de período 0/ausente não deriva nada: é "sem meta", não "meta 0".
        if (goal !== null && goal > 0) {
          value = goal / periodBd;
          derived.add(key);
        }
      }
      if (value !== null) daily[key] = (daily[key] ?? 0) + value;
    }
  }

  const window: DailyTargets = {};
  for (const key of TARGET_KEYS) {
    const d = daily[key];
    if (d !== undefined) window[key] = round1(d * windowBd);
  }

  return { daily, window, derived: [...derived], window_business_days: windowBd };
}

/** Quanto falta: nunca negativo — bater a meta com folga não vira "gap -3". */
export function gapOf(target: number | undefined, actual: number): number {
  if (target === undefined) return 0;
  return Math.max(0, round1(target - actual));
}
