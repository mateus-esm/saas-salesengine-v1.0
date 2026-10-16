// SE-SUP1-5 — "Meta diária por marco": revenue_config.daily_targets no formulário.
//
// O relatório lê estas metas (supabase/functions/_shared/report-targets.ts); onde
// o campo fica VAZIO ele deriva da meta do período ÷ dias úteis. Por isso vazio
// aqui significa "apagar a chave", nunca gravar 0 — 0 é uma meta explícita de
// zero. As chaves vêm do mesmo módulo que o relatório lê, para não divergirem.

import { TARGET_KEYS, toTarget, type TargetKey } from "../../supabase/functions/_shared/report-targets";

export const DAILY_TARGET_FIELDS: { key: TargetKey; label: string }[] = [
  { key: "touchpoints", label: "Touchpoints" },
  { key: "qualified", label: "Qualificados" },
  { key: "proposals_sent", label: "Propostas enviadas" },
  { key: "meetings_scheduled", label: "Reuniões agendadas" },
  { key: "meetings_done", label: "Reuniões realizadas" },
  { key: "deals_won", label: "Fechamentos" },
  { key: "revenue", label: "Receita (R$)" },
];

export type DailyTargetsDraft = Partial<Record<TargetKey, string>>;

/** revenue_config.daily_targets (cru do banco) → texto dos campos. Lixo some. */
export function parseDailyTargets(raw: unknown): DailyTargetsDraft {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: DailyTargetsDraft = {};
  for (const key of TARGET_KEYS) {
    const n = toTarget(src[key]);
    if (n !== null) out[key] = String(n);
  }
  return out;
}

/**
 * Campos → objeto a gravar em revenue_config.daily_targets, ou undefined quando
 * não sobrou nada (a chave inteira sai do config e tudo volta a ser derivado).
 * Chaves desconhecidas que já estavam no banco passam intactas.
 */
export function serializeDailyTargets(
  draft: DailyTargetsDraft | undefined,
  existing?: unknown,
): Record<string, unknown> | undefined {
  const prev = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev)) {
    if (!(TARGET_KEYS as readonly string[]).includes(k)) out[k] = v;
  }
  for (const key of TARGET_KEYS) {
    const n = toTarget(draft?.[key]);
    if (n !== null) out[key] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * O que gravar em revenue_config.daily_targets ao salvar o formulário.
 *
 * Rascunho SEM o campo (`undefined`) é um rascunho antigo, de antes deste bloco
 * existir: o usuário nunca viu os inputs, então salvar NÃO pode apagar o que
 * está no banco — devolve o valor existente intacto. Só um rascunho que tem o
 * campo (mesmo vazio, `{}`) é decisão explícita e passa por serializeDailyTargets.
 */
export function dailyTargetsToSave(draft: DailyTargetsDraft | undefined, existing: unknown): unknown {
  return draft === undefined ? existing : serializeDailyTargets(draft, existing);
}
