// SE-FIX-002 — o plano do funil: das metas de passagem por etapa às entradas
// necessárias no topo.
//
// O modelo pedido pelo usuário: cada etapa declara a meta de passagem de leads
// para a PRÓXIMA etapa, e o topo do funil não é digitado — é derivado. Como essa
// aritmética decide quantos leads o time precisa prospectar, ela vive aqui, pura
// e testada, e não dentro do componente.

/** Linha crua de fn_stage_conversion_plan (nomes como o RPC devolve). */
export interface PlanStageRow {
  stage_id: string;
  stage_name: string;
  stage_position: number;
  stage_type: string;
  funnel_event: string | null;
  max_idle_hours: number | null;
  historical_rate: number | null;
  entered_count: number;
  advanced_count: number;
  avg_days_in_stage: number | null;
}

export interface StagePass {
  stage: PlanStageRow;
  /** Meta de passagem usada no cálculo, 0–1. */
  rate: number;
  /**
   * false → a taxa NÃO é utilizável (não existe, ou é 0) e a etapa foi tratada
   * como passagem neutra.
   *
   * A tela precisa disto para não escrever "0% de passagem" numa etapa que o
   * cálculo tratou como 100% — a linha se contradiria sozinha.
   */
  usable: boolean;
  /** true → veio de revenue_config.conversion_overrides (digitada, não histórica). */
  manual: boolean;
  /** Negócios que precisam CHEGAR nesta etapa para a meta fechar. null sem meta. */
  required_entries: number | null;
}

export interface RevenuePlan {
  /** Etapas de passagem (stage_type 'open'), na ordem do funil. */
  stages: StagePass[];
  /** Terminais e de reciclo ('won'/'lost'/'ciclo'): fora da cadeia de passagem. */
  skipped: PlanStageRow[];
  /** Conversão do funil inteiro: produto das metas de passagem. */
  cumulative_rate: number | null;
  /** Negócios que precisam ENTRAR no topo do funil. */
  required_inbound: number | null;
  /** Etapa declarada como "reunião feita" (funnel_event = 'meeting_done'). */
  meeting_stage: StagePass | null;
  /** Reuniões que precisam acontecer para a meta fechar. */
  required_meetings: number | null;
  /** Soma do tempo médio observado por etapa, em dias. */
  observed_lead_time_days: number | null;
  /** Dias por etapa para caber no lead time alvo (divisão por igual). */
  stage_budget_days: number | null;
  /** Nomes das etapas sem taxa confiável (> 0) — ficaram fora do produto. */
  stages_without_rate: string[];
}

const clampRate = (n: number): number => Math.max(0, Math.min(1, n));

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Etapas que a cadeia de passagem considera (as terminais não "passam"). */
const isPassThrough = (row: PlanStageRow): boolean => row.stage_type === "open";

function effectiveRate(row: PlanStageRow, overrides: Record<string, number>): number {
  const raw = row.stage_id in overrides ? overrides[row.stage_id] : row.historical_rate;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? clampRate(n) : 0;
}

/**
 * A cadeia inteira, do fechamento para trás.
 *
 * `goalDeals` é o fim do funil; cada etapa k responde "quantos negócios precisam
 * passar por mim para que `goalDeals` saiam" — que é `goalDeals` dividido pelo
 * produto das taxas de k até a última etapa. O topo do funil é o k = 1 dessa
 * conta, e é por isso que ele não é digitado em lugar nenhum.
 *
 * Taxa 0 ou ausente NÃO zera a cadeia: a etapa sai do produto e entra em
 * `stages_without_rate`, para a tela poder nomeá-la em vez de mostrar um número
 * inflado por um zero. A hipótese é passagem neutra (100%) — é a única que não
 * infla a conta — e a tela diz isso em vez de escrever "0% de passagem" numa
 * etapa que perdeu zero leads.
 */
export function buildRevenuePlan(input: {
  rows: PlanStageRow[];
  goalDeals: number;
  overrides?: Record<string, number>;
  targetLeadTimeDays?: number | null;
}): RevenuePlan {
  const { rows, goalDeals } = input;
  const overrides = input.overrides ?? {};

  const skipped = rows.filter((row) => !isPassThrough(row));
  const open = rows
    .filter(isPassThrough)
    .sort((a, b) => a.stage_position - b.stage_position);

  const rates = open.map((row) => effectiveRate(row, overrides));

  const stages_without_rate: string[] = [];
  let cumulative = 1;
  let usable_count = 0;
  rates.forEach((rate, i) => {
    if (rate > 0) {
      cumulative *= rate;
      usable_count += 1;
    } else {
      stages_without_rate.push(open[i].stage_name);
    }
  });

  const hasGoal = Number.isFinite(goalDeals) && goalDeals > 0;
  const hasChain = hasGoal && usable_count > 0 && cumulative > 0;

  const cumulative_rate = hasChain ? cumulative : null;
  const required_inbound = hasChain ? Math.ceil(goalDeals / cumulative) : null;

  const stages: StagePass[] = open.map((row, i) => {
    let tail = 1;
    for (let k = i; k < rates.length; k += 1) {
      if (rates[k] > 0) tail *= rates[k];
    }
    return {
      stage: row,
      rate: rates[i],
      usable: rates[i] > 0,
      manual: row.stage_id in overrides,
      required_entries: hasChain && tail > 0 ? Math.ceil(goalDeals / tail) : null,
    };
  });

  const meeting_stage = stages.find((s) => s.stage.funnel_event === "meeting_done") ?? null;

  const dwell = open
    .map((row) => row.avg_days_in_stage)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d) && d >= 0);
  const observed_lead_time_days = dwell.length > 0 ? round1(dwell.reduce((a, b) => a + b, 0)) : null;

  const target = input.targetLeadTimeDays;
  const stage_budget_days =
    typeof target === "number" && Number.isFinite(target) && target > 0 && stages.length > 0
      ? round1(target / stages.length)
      : null;

  return {
    stages,
    skipped,
    cumulative_rate,
    required_inbound,
    meeting_stage,
    required_meetings: meeting_stage ? meeting_stage.required_entries : null,
    observed_lead_time_days,
    stage_budget_days,
    stages_without_rate,
  };
}

/**
 * 0.0625 → "6,25%".
 *
 * A conversão do funil inteiro é o produto de várias etapas e costuma ser
 * pequena: com uma casa decimal, 6,25% viraria 6,3% e um funil de verdade
 * pareceria sempre "0%". Abaixo de 10% mantemos duas casas.
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  const pct = rate * 100;
  const digits = pct >= 10 ? 0 : 2;
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function formatInt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("pt-BR");
}
