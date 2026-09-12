// Sprint 11 · Onda 2B · T25 — the pipeline's placar, as a pure model.
//
// The numbers come from crm_placar (wins and losses by the owner AT THE MOMENT
// they happened, the same rule as the dashboard). This turns that answer into
// what the strip shows — each number once: Meta · Realizado · Ritmo · Falta ·
// Conversão · Ciclo — plus one row per owner (whoever sold, lost, holds open
// deals or has a goal; the unowned as "Sem responsável", last).

export interface PlacarOwner {
  owner_id: string | null;
  owner_name: string | null;
  won: number;
  lost: number;
  in_progress: number;
  won_revenue: number;
}

export interface Placar {
  won: number;
  lost: number;
  won_revenue: number;
  /** Open deals right now (a snapshot, not "this period"). */
  in_progress: number;
  avg_velocity_days: number | null;
  /** 0–100; null when nothing was won or lost in the period. */
  win_rate: number | null;
  by_owner: PlacarOwner[];
}

export interface OwnerGoal {
  owner_id: string;
  target_deals: number;
  target_revenue: number;
}

export type PaceStatus = "ahead" | "on_track" | "behind";

export interface ScoreboardOwnerRow {
  ownerId: string | null;
  name: string;
  won: number;
  wonRevenue: number;
  inProgress: number;
  /** The owner's deals goal; null when none. */
  target: number | null;
  pct: number | null;
  runRate: number | null;
}

export interface Scoreboard {
  /** Which goal leads the strip; null when the pipeline has none. */
  basis: "revenue" | "deals" | null;
  meta: string | null;
  realizado: string;
  /** 0–100, for the thin bar. */
  progressPct: number | null;
  /** Run-rate projection: where the period ends at this pace, % of the goal. */
  ritmoPct: number | null;
  ritmoStatus: PaceStatus | null;
  falta: string | null;
  conversao: string;
  ciclo: string;
  owners: ScoreboardOwnerRow[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : num(v));

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    .format(value)
    .replace(/\u00a0/g, " ");
}

const deals = (n: number) => `${n} ${n === 1 ? "negócio" : "negócios"}`;

/** Compute run-rate: (current/target) * (total/elapsed) * 100. */
export function computeRunRate(current: number, target: number, elapsed: number, total: number): number | null {
  if (target <= 0 || elapsed <= 0 || total <= 0) return null;
  return Math.round((current / target) * (total / elapsed) * 100);
}

function paceOf(current: number, target: number, runRate: number | null): PaceStatus | null {
  if (target <= 0 || runRate === null) return null;
  if (current >= target || runRate >= 110) return "ahead";
  if (runRate >= 90) return "on_track";
  return "behind";
}

/** crm_placar's jsonb → a typed placar (numbers may arrive as text). */
export function placarFromRpc(raw: unknown): Placar {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const won = num(r.won);
  const lost = num(r.lost);
  const byOwner = Array.isArray(r.by_owner) ? (r.by_owner as Record<string, unknown>[]) : [];
  return {
    won,
    lost,
    won_revenue: num(r.won_revenue),
    in_progress: num(r.in_progress),
    avg_velocity_days: numOrNull(r.avg_velocity_days),
    win_rate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    by_owner: byOwner.map((o) => ({
      owner_id: typeof o.owner_id === "string" ? o.owner_id : null,
      owner_name: typeof o.owner_name === "string" && o.owner_name.trim() ? o.owner_name : null,
      won: num(o.won),
      lost: num(o.lost),
      in_progress: num(o.in_progress),
      won_revenue: num(o.won_revenue),
    })),
  };
}

export function buildScoreboard(input: {
  placar: Placar;
  goalDeals: number;
  goalRevenue: number;
  ownerGoals: OwnerGoal[];
  elapsedDays: number;
  totalDays: number;
  nameOf?: (userId: string) => string | null;
}): Scoreboard {
  const { placar, goalDeals, goalRevenue, ownerGoals, elapsedDays, totalDays, nameOf } = input;
  const basis: Scoreboard["basis"] = goalRevenue > 0 ? "revenue" : goalDeals > 0 ? "deals" : null;
  const current = basis === "revenue" ? placar.won_revenue : placar.won;
  const target = basis === "revenue" ? goalRevenue : basis === "deals" ? goalDeals : 0;
  const runRate = basis ? computeRunRate(current, target, elapsedDays, totalDays) : null;

  const show = (n: number) => (basis === "revenue" ? formatBRL(n) : deals(n));

  // Owners: whoever appears in the placar, plus goals with no activity yet.
  const goalOf = new Map(ownerGoals.map((g) => [g.owner_id, g]));
  const rows = new Map<string | null, ScoreboardOwnerRow>();
  const rowFor = (ownerId: string | null, ownerName: string | null): ScoreboardOwnerRow => {
    const goal = ownerId ? goalOf.get(ownerId) : undefined;
    const t = goal && goal.target_deals > 0 ? goal.target_deals : null;
    return {
      ownerId,
      name: ownerId ? ownerName ?? nameOf?.(ownerId) ?? "Usuário removido" : "Sem responsável",
      won: 0,
      wonRevenue: 0,
      inProgress: 0,
      target: t,
      pct: null,
      runRate: null,
    };
  };
  for (const o of placar.by_owner) {
    const row = rowFor(o.owner_id, o.owner_name);
    row.won = o.won;
    row.wonRevenue = o.won_revenue;
    row.inProgress = o.in_progress;
    rows.set(o.owner_id, row);
  }
  for (const g of ownerGoals) if (!rows.has(g.owner_id)) rows.set(g.owner_id, rowFor(g.owner_id, null));
  for (const row of rows.values()) {
    if (row.target) {
      row.pct = Math.min(100, Math.round((row.won / row.target) * 100));
      row.runRate = computeRunRate(row.won, row.target, elapsedDays, totalDays);
    }
  }
  const owners = [...rows.values()].sort((a, b) => {
    if (!a.ownerId !== !b.ownerId) return a.ownerId ? -1 : 1; // "Sem responsável" last
    return b.wonRevenue - a.wonRevenue || b.won - a.won || (b.target ?? 0) - (a.target ?? 0) || a.name.localeCompare(b.name);
  });

  return {
    basis,
    meta: basis ? show(target) : null,
    realizado: basis ? show(current) : placar.won_revenue > 0 ? formatBRL(placar.won_revenue) : deals(placar.won),
    progressPct: basis ? Math.min(100, Math.round((current / target) * 100)) : null,
    ritmoPct: runRate,
    ritmoStatus: paceOf(current, target, runRate),
    falta: basis ? show(Math.max(0, target - current)) : null,
    conversao: placar.win_rate !== null ? `${placar.win_rate}%` : "—",
    ciclo: placar.avg_velocity_days !== null ? `${Math.round(placar.avg_velocity_days)} dias` : "—",
    owners,
  };
}
