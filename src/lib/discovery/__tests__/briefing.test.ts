import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "../types";
import { buildBriefing } from "../briefing";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

const questions = [
  q({ code: "empresa.o_que_vende", label: "O que vende?", maps_to: "agent", sort_order: 10 }),
  q({
    code: "funil.ticket", label: "Ticket", maps_to: "crm", sort_order: 20, type: "select",
    options: [{ value: "1_5k", label: "R$ 1 a 5 mil" }],
  }),
  q({
    code: "canais.ativos", label: "Canais", maps_to: "channels", sort_order: 30, type: "multi",
    options: [{ value: "whatsapp", label: "WhatsApp" }],
  }),
];

describe("buildBriefing", () => {
  const answers = {
    "empresa.o_que_vende": "energia solar",
    "funil.ticket": "1_5k",
    "canais.ativos": ["whatsapp"],
  };

  it("o texto do agente leva só o que é do agente, com o nome do cliente", () => {
    const { agentText } = buildBriefing(questions, answers, "Casa Flow");
    expect(agentText).toContain("Casa Flow");
    expect(agentText).toContain("O que vende?");
    expect(agentText).toContain("energia solar");
    expect(agentText).not.toContain("Ticket");
  });

  it("o checklist traz o resto, com o rótulo da opção e não o slug", () => {
    const { checklist } = buildBriefing(questions, answers, "Casa Flow");
    expect(checklist).toEqual([
      { group: "crm", label: "Ticket", answer: "R$ 1 a 5 mil" },
      { group: "channels", label: "Canais", answer: "WhatsApp" },
    ]);
  });

  it("pergunta sem resposta não entra em lugar nenhum", () => {
    const { agentText, checklist } = buildBriefing(questions, {}, "Casa Flow");
    expect(agentText).not.toContain("O que vende?");
    expect(checklist).toEqual([]);
  });
});
