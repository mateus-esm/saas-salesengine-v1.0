import { describe, expect, it } from "vitest";
import { customRange, paramsToPeriod, periodRange, periodToParams, selectPreset } from "@/lib/dashboardPeriod";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe("customRange (semiaberto)", () => {
  it("um dia só é [00:00, 00:00 do dia seguinte)", () => {
    const r = customRange({ from: at(2026, 10, 14, 15, 30) });
    expect(r.from).toEqual(at(2026, 10, 14));
    expect(r.to).toEqual(at(2026, 10, 15));
  });

  it("intervalo inclui o dia final inteiro", () => {
    const r = customRange({ from: at(2026, 10, 1), to: at(2026, 10, 7) });
    expect(r.from).toEqual(at(2026, 10, 1));
    expect(r.to).toEqual(at(2026, 10, 8));
  });

  it("cruza o fim do mês", () => {
    const r = customRange({ from: at(2026, 10, 30), to: at(2026, 10, 31) });
    expect(r.to).toEqual(at(2026, 11, 1));
  });

  it("datas invertidas são reordenadas", () => {
    const r = customRange({ from: at(2026, 10, 7), to: at(2026, 10, 1) });
    expect(r.from).toEqual(at(2026, 10, 1));
    expect(r.to).toEqual(at(2026, 10, 8));
  });

  it("dois períodos adjacentes não se sobrepõem", () => {
    const a = customRange({ from: at(2026, 10, 1), to: at(2026, 10, 7) });
    const b = customRange({ from: at(2026, 10, 8), to: at(2026, 10, 14) });
    expect(a.to).toEqual(b.from);
  });
});

describe("periodRange", () => {
  const now = at(2026, 10, 15, 11);
  it("custom sem dias cai em hoje", () => {
    expect(periodRange("custom", now, null)).toEqual({ from: at(2026, 10, 15), to: at(2026, 10, 16) });
  });
  it("custom usa os dias escolhidos", () => {
    expect(periodRange("custom", now, { from: at(2026, 10, 2), to: at(2026, 10, 3) })).toEqual({
      from: at(2026, 10, 2),
      to: at(2026, 10, 4),
    });
  });
  it("presets antigos seguem iguais", () => {
    expect(periodRange("today", now).from).toEqual(at(2026, 10, 15));
    expect(periodRange("7d", now).from).toEqual(at(2026, 10, 9));
  });
});

describe("período na URL", () => {
  it("ida e volta de um intervalo", () => {
    const p = periodToParams(
      { preset: "custom", custom: { from: at(2026, 10, 1), to: at(2026, 10, 7) } },
      new URLSearchParams("resp=x"),
    );
    expect(p.get("periodo")).toBe("custom");
    expect(p.get("de")).toBe("2026-10-01");
    expect(p.get("ate")).toBe("2026-10-07");
    expect(p.get("resp")).toBe("x");
    const back = paramsToPeriod(p);
    expect(back.preset).toBe("custom");
    expect(back.custom?.from).toEqual(at(2026, 10, 1));
    expect(back.custom?.to).toEqual(at(2026, 10, 7));
  });

  it("dia único não escreve `ate`", () => {
    const p = periodToParams(
      { preset: "custom", custom: { from: at(2026, 10, 5), to: at(2026, 10, 5) } },
      new URLSearchParams(),
    );
    expect(p.has("ate")).toBe(false);
  });

  it("o padrão sai da URL", () => {
    const p = periodToParams({ preset: "30d", custom: null }, new URLSearchParams("periodo=7d&de=2026-10-01"));
    expect(p.toString()).toBe("");
  });

  it("parâmetro quebrado degrada para o padrão", () => {
    expect(paramsToPeriod(new URLSearchParams("periodo=banana")).preset).toBe("30d");
    expect(paramsToPeriod(new URLSearchParams("periodo=custom&de=2026-13-45")).preset).toBe("30d");
    expect(paramsToPeriod(new URLSearchParams("periodo=custom&de=lixo")).preset).toBe("30d");
  });
});

describe("escolher Personalizado no select", () => {
  const now = at(2026, 10, 15, 11);
  it("semeia hoje, escreve de na URL e o período é o dia de hoje", () => {
    const state = selectPreset("custom", null, now);
    expect(state.custom?.from).toEqual(at(2026, 10, 15));
    const params = periodToParams(state, new URLSearchParams());
    expect(params.get("periodo")).toBe("custom");
    expect(params.get("de")).toBe("2026-10-15");
    const back = paramsToPeriod(params, now);
    expect(back.preset).toBe("custom");
    expect(periodRange(back.preset, now, back.custom)).toEqual({ from: at(2026, 10, 15), to: at(2026, 10, 16) });
  });
  it("periodo=custom sem de também vale hoje", () => {
    const back = paramsToPeriod(new URLSearchParams("periodo=custom"), now);
    expect(back.preset).toBe("custom");
    expect(back.custom?.from).toEqual(at(2026, 10, 15));
  });
  it("mantém o intervalo já escolhido e limpa ao sair de custom", () => {
    const c = { from: at(2026, 10, 1), to: at(2026, 10, 3) };
    expect(selectPreset("custom", c, now).custom).toBe(c);
    expect(selectPreset("7d", c, now)).toEqual({ preset: "7d", custom: null });
  });
});
