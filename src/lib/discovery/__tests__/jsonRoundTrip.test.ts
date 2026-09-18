import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "../types";
import { buildQuestionExport, parseAnswerImport } from "../jsonRoundTrip";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

const questions = [
  q({ code: "empresa.o_que_vende", label: "O que vende?", type: "textarea" }),
  q({ code: "funil.ticket", type: "select", options: [{ value: "1_5k", label: "R$ 1 a 5 mil" }] }),
  q({
    code: "agente.tom", type: "multi", max_select: 3,
    options: [{ value: "direto", label: "Direto" }, { value: "cordial", label: "Cordial" }],
  }),
];

describe("buildQuestionExport", () => {
  it("leva a instrução, o código e as opções — é o que a IA do cliente precisa", () => {
    const out = buildQuestionExport(questions);
    expect(out.versao).toBe(1);
    expect(out.instrucoes).toContain("respostas");
    expect(out.perguntas).toHaveLength(3);
    expect(out.perguntas[1]).toEqual({
      code: "funil.ticket", pergunta: "Pergunta", ajuda: null,
      tipo: "select", obrigatoria: true, opcoes: ["1_5k"], escolha_ate: null,
    });
    expect(out.perguntas[2].escolha_ate).toBe(3);
  });

  it("o formato de resposta esperado vem junto, com os códigos reais", () => {
    expect(buildQuestionExport(questions).formato_esperado).toEqual({
      respostas: { "empresa.o_que_vende": "", "funil.ticket": "", "agente.tom": [] },
    });
  });
});

describe("parseAnswerImport", () => {
  it("aceita o formato completo e o objeto de respostas cru", () => {
    const completo = parseAnswerImport(questions, JSON.stringify({ respostas: { "funil.ticket": "1_5k" } }));
    const cru = parseAnswerImport(questions, JSON.stringify({ "funil.ticket": "1_5k" }));
    expect(completo).toEqual({ answers: { "funil.ticket": "1_5k" }, imported: ["funil.ticket"], ignored: [] });
    expect(cru).toEqual(completo);
  });

  it("descarta código que não existe e opção inventada, e diz o que descartou", () => {
    const r = parseAnswerImport(questions, JSON.stringify({
      "funil.ticket": "inventado", "nao.existe": "x", "empresa.o_que_vende": "energia solar",
    }));
    expect(r).toEqual({
      answers: { "empresa.o_que_vende": "energia solar" },
      imported: ["empresa.o_que_vende"],
      ignored: ["funil.ticket", "nao.existe"],
    });
  });

  it("corta a multi no teto e descarta valor fora da lista", () => {
    const r = parseAnswerImport(questions, JSON.stringify({ "agente.tom": ["direto", "inventado", "cordial"] }));
    expect(r).toEqual({ answers: { "agente.tom": ["direto", "cordial"] }, imported: ["agente.tom"], ignored: [] });
  });

  it("recusa o que não é JSON, o que não é objeto, e o que não trouxe nada", () => {
    expect(parseAnswerImport(questions, "não é json")).toEqual({ error: "json_invalido" });
    expect(parseAnswerImport(questions, "[1,2]")).toEqual({ error: "formato_invalido" });
    expect(parseAnswerImport(questions, "{}")).toEqual({ error: "nenhuma_resposta" });
    expect(parseAnswerImport(questions, JSON.stringify({ "nao.existe": "x" }))).toEqual({ error: "nenhuma_resposta" });
  });
});
