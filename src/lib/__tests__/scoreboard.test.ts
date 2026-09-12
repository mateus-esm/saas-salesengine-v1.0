import { describe, expect, it } from "vitest";

import { buildScoreboard, placarFromRpc, type Placar } from "../scoreboard";

describe("placarFromRpc", () => {
  it("reads crm_placar, numbers sent as text included", () => {
    const p = placarFromRpc({
      won: 3,
      lost: "1",
      won_revenue: "12500.50",
      in_progress: 40,
      avg_velocity_days: "24.5",
      by_owner: [
        { owner_id: "u1", owner_name: "Luiz", won: 2, lost: 0, in_progress: 10, won_revenue: "10000" },
        { owner_id: null, owner_name: null, won: 1, lost: 1, in_progress: 30, won_revenue: 2500.5 },
      ],
    });
    expect(p).toMatchObject({ won: 3, lost: 1, won_revenue: 12500.5, in_progress: 40, avg_velocity_days: 24.5, win_rate: 75 });
    expect(p.by_owner[1]).toEqual({ owner_id: null, owner_name: null, won: 1, lost: 1, in_progress: 30, won_revenue: 2500.5 });
  });

  it("an empty or missing answer is zeros, with no fake rates", () => {
    expect(placarFromRpc(null)).toEqual({
      won: 0,
      lost: 0,
      won_revenue: 0,
      in_progress: 0,
      avg_velocity_days: null,
      win_rate: null,
      by_owner: [],
    });
  });
});

const placar = (p: Partial<Placar> = {}): Placar => ({
  won: 0,
  lost: 0,
  won_revenue: 0,
  in_progress: 0,
  avg_velocity_days: null,
  win_rate: null,
  by_owner: [],
  ...p,
});

describe("buildScoreboard", () => {
  const halfway = { elapsedDays: 15, totalDays: 30 };

  it("a revenue goal leads: every number once — Meta, Realizado, Ritmo, Falta, Conversão, Ciclo", () => {
    const s = buildScoreboard({
      placar: placar({ won: 4, lost: 4, won_revenue: 25000, win_rate: 50, avg_velocity_days: 23.6 }),
      goalDeals: 10,
      goalRevenue: 50000,
      ownerGoals: [],
      ...halfway,
    });
    expect(s.basis).toBe("revenue");
    expect(s.meta).toBe("R$ 50.000");
    expect(s.realizado).toBe("R$ 25.000");
    expect(s.falta).toBe("R$ 25.000");
    expect(s.progressPct).toBe(50);
    expect(s.ritmoPct).toBe(100);
    expect(s.ritmoStatus).toBe("on_track");
    expect(s.conversao).toBe("50%");
    expect(s.ciclo).toBe("24 dias");
  });

  it("with only a deals goal, the deals lead; a met goal is ahead and nothing is missing", () => {
    const s = buildScoreboard({ placar: placar({ won: 12 }), goalDeals: 10, goalRevenue: 0, ownerGoals: [], ...halfway });
    expect(s.basis).toBe("deals");
    expect(s.meta).toBe("10 negócios");
    expect(s.realizado).toBe("12 negócios");
    expect(s.falta).toBe("0 negócios");
    expect(s.progressPct).toBe(100);
    expect(s.ritmoStatus).toBe("ahead");
  });

  it("behind pace below 90% of the expected", () => {
    const s = buildScoreboard({ placar: placar({ won: 2 }), goalDeals: 10, goalRevenue: 0, ownerGoals: [], ...halfway });
    expect(s.ritmoPct).toBe(40);
    expect(s.ritmoStatus).toBe("behind");
  });

  it("no goal: what was done still shows; meta, falta, progress and pace do not pretend", () => {
    const s = buildScoreboard({
      placar: placar({ won: 3, won_revenue: 9000 }),
      goalDeals: 0,
      goalRevenue: 0,
      ownerGoals: [],
      ...halfway,
    });
    expect(s.basis).toBeNull();
    expect(s.meta).toBeNull();
    expect(s.realizado).toBe("R$ 9.000");
    expect(s.falta).toBeNull();
    expect(s.progressPct).toBeNull();
    expect(s.ritmoPct).toBeNull();
    expect(s.ritmoStatus).toBeNull();
    expect(s.conversao).toBe("—");
    expect(s.ciclo).toBe("—");
  });

  it("per owner: everyone who sold or has a goal, the unowned last as 'Sem responsável'", () => {
    const s = buildScoreboard({
      placar: placar({
        won: 4,
        by_owner: [
          { owner_id: null, owner_name: null, won: 1, lost: 0, in_progress: 20, won_revenue: 1000 },
          { owner_id: "u1", owner_name: "Luiz", won: 2, lost: 1, in_progress: 5, won_revenue: 8000 },
          { owner_id: "u2", owner_name: null, won: 1, lost: 0, in_progress: 3, won_revenue: 3000 },
        ],
      }),
      goalDeals: 10,
      goalRevenue: 0,
      ownerGoals: [
        { owner_id: "u1", target_deals: 4, target_revenue: 0 },
        { owner_id: "u3", target_deals: 2, target_revenue: 0 },
      ],
      nameOf: (id) => (id === "u2" ? "Mateus" : id === "u3" ? "Ana" : null),
      ...halfway,
    });
    expect(s.owners.map((o) => o.name)).toEqual(["Luiz", "Mateus", "Ana", "Sem responsável"]);
    expect(s.owners[0]).toMatchObject({ ownerId: "u1", won: 2, target: 4, pct: 50, runRate: 100 });
    expect(s.owners[1]).toMatchObject({ ownerId: "u2", target: null, pct: null, runRate: null });
    expect(s.owners[2]).toMatchObject({ ownerId: "u3", won: 0, target: 2, pct: 0 });
    expect(s.owners[3]).toMatchObject({ ownerId: null, won: 1, inProgress: 20 });
  });

  it("an owner no longer on the team shows as 'Usuário removido'", () => {
    const s = buildScoreboard({
      placar: placar({ by_owner: [{ owner_id: "gone", owner_name: null, won: 1, lost: 0, in_progress: 0, won_revenue: 0 }] }),
      goalDeals: 0,
      goalRevenue: 0,
      ownerGoals: [],
      ...halfway,
    });
    expect(s.owners[0].name).toBe("Usuário removido");
  });
});
