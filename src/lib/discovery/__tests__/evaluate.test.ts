import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "../types";
import { evaluateDiscovery, groupIntoBlocks, hasAnswer, withDefaults } from "../evaluate";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

describe("hasAnswer", () => {
  it("lista vazia não é resposta; lista com item é", () => {
    const m = q({ type: "multi" });
    expect(hasAnswer(m, [])).toBe(false);
    expect(hasAnswer(m, ["a"])).toBe(true);
  });

  it("texto em branco não é resposta", () => {
    const t = q({ type: "textarea" });
    expect(hasAnswer(t, "   ")).toBe(false);
    expect(hasAnswer(t, undefined)).toBe(false);
    expect(hasAnswer(t, "oi")).toBe(true);
  });
});

describe("groupIntoBlocks", () => {
  it("agrupa na ordem de sort_order, sem reordenar os blocos", () => {
    const blocks = groupIntoBlocks([
      q({ code: "b2", block: "dois", block_label: "Dois", sort_order: 20 }),
      q({ code: "a1", block: "um", block_label: "Um", sort_order: 10 }),
      q({ code: "b1", block: "dois", block_label: "Dois", sort_order: 15 }),
    ]);
    expect(blocks.map((b) => b.id)).toEqual(["um", "dois"]);
    expect(blocks[1].questions.map((x) => x.code)).toEqual(["b1", "b2"]);
  });
});

describe("evaluateDiscovery", () => {
  const questions = [
    q({ code: "a", required: true }),
    q({ code: "b", required: true, block_label: "Bloco 2" }),
    q({ code: "c", required: false }),
  ];

  it("conta só as obrigatórias e nomeia o que falta", () => {
    const r = evaluateDiscovery(questions, { a: "resposta" });
    expect(r.total).toBe(2);
    expect(r.answered).toBe(1);
    expect(r.percent).toBe(50);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual([{ code: "b", label: "Pergunta", block_label: "Bloco 2" }]);
  });

  it("opcional respondida não infla o percentual", () => {
    expect(evaluateDiscovery(questions, { a: "x", c: "x" }).percent).toBe(50);
  });

  it("tudo respondido é 100 e completo", () => {
    const r = evaluateDiscovery(questions, { a: "x", b: "y" });
    expect(r.percent).toBe(100);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("sem obrigatórias, 100 — nunca divide por zero", () => {
    expect(evaluateDiscovery([q({ required: false })], {}).percent).toBe(100);
  });
});

describe("withDefaults", () => {
  it("o padrão preenche o que ninguém tocou, e nunca sobrescreve resposta", () => {
    const questions = [
      q({ code: "tom", type: "multi", default_value: ["consultivo"] }),
      q({ code: "ticket", type: "select", default_value: null }),
      q({ code: "funil", type: "select_other", default_value: "padrao" }),
    ];
    expect(withDefaults(questions, { funil: "meu funil" })).toEqual({
      tom: ["consultivo"],
      funil: "meu funil",
    });
  });
});
