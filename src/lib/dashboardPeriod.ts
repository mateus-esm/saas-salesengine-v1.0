// SE-SUP1-5 (#14) — o período do dashboard, puro e testável.
//
// Os RPCs filtram `>= from and < to` (intervalo semiaberto). O preset
// "Personalizado" (um dia ou um intervalo) respeita isso à risca: o dia final
// ESCOLHIDO entra inteiro e `to` é a meia-noite do dia seguinte. Um dia só é
// [00:00, 00:00 do dia seguinte). Os presets antigos continuam em endOfDay —
// não mexemos no que já fecha com os números de hoje.
//
// O período vive na URL (`periodo`, `de`, `ate`) para o link copiado mostrar o
// mesmo recorte ao colega. Dias na URL são locais, "YYYY-MM-DD", fim inclusivo,
// como a pessoa lê; leitura nunca lança — parâmetro ruim cai no padrão.

import { addDays, endOfDay, endOfMonth, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { dayToIso } from "@/lib/crmFilterParams";

export type PeriodPreset = "today" | "7d" | "30d" | "month" | "last_month" | "90d" | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  last_month: "Mês passado",
  "90d": "Últimos 90 dias",
  custom: "Personalizado",
};

export const DEFAULT_PRESET: PeriodPreset = "30d";

/** Dia inicial e final (ambos inclusivos) escolhidos no seletor. */
export interface CustomDays {
  from: Date;
  to?: Date;
}

/**
 * [início do primeiro dia, início do dia seguinte ao último). Sem `to` é um dia
 * só. Datas invertidas são reordenadas — o seletor deixa clicar na ordem errada.
 */
export function customRange(days: CustomDays): { from: Date; to: Date } {
  const a = startOfDay(days.from);
  const b = startOfDay(days.to ?? days.from);
  const [first, last] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
  return { from: first, to: startOfDay(addDays(last, 1)) };
}

export function periodRange(
  preset: PeriodPreset,
  now = new Date(),
  custom?: CustomDays | null,
): { from: Date; to: Date } {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "custom":
      // "Personalizado" sem dias escolhidos ainda: cai em hoje, não em vazio.
      return customRange(custom ?? { from: now });
    case "90d":
    default:
      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now) };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseDay(v: string | null): Date | null {
  const iso = v ? dayToIso(v) : null;
  return iso ? new Date(iso) : null;
}

export interface PeriodState {
  preset: PeriodPreset;
  custom: CustomDays | null;
}

const PRESETS = Object.keys(PERIOD_LABELS) as PeriodPreset[];

export function paramsToPeriod(params: URLSearchParams, now = new Date()): PeriodState {
  const raw = params.get("periodo") as PeriodPreset | null;
  const preset = raw && PRESETS.includes(raw) ? raw : DEFAULT_PRESET;
  if (preset !== "custom") return { preset, custom: null };
  const rawFrom = params.get("de");
  // `periodo=custom` sem `de` é o estado logo após escolher o preset: vale "hoje".
  // Já um `de` PRESENTE e inválido é link quebrado: volta ao padrão.
  const from = rawFrom === null ? startOfDay(now) : parseDay(rawFrom);
  if (!from) return { preset: DEFAULT_PRESET, custom: null };
  const to = parseDay(params.get("ate"));
  return { preset, custom: { from, to: to ?? undefined } };
}

/**
 * Troca de preset pelo select. Escolher "Personalizado" semeia o dia de hoje
 * (ou o intervalo já escolhido), para a URL nunca ficar em `custom` sem dias.
 */
export function selectPreset(preset: PeriodPreset, current: CustomDays | null, now = new Date()): PeriodState {
  if (preset !== "custom") return { preset, custom: null };
  return { preset, custom: current ?? { from: startOfDay(now) } };
}

/** Escreve o período em `base` sem tocar nos outros parâmetros. */
export function periodToParams(state: PeriodState, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  p.delete("periodo");
  p.delete("de");
  p.delete("ate");
  if (state.preset === DEFAULT_PRESET) return p;
  p.set("periodo", state.preset);
  if (state.preset === "custom" && state.custom) {
    p.set("de", toDay(state.custom.from));
    if (state.custom.to && toDay(state.custom.to) !== toDay(state.custom.from)) {
      p.set("ate", toDay(state.custom.to));
    }
  }
  return p;
}
