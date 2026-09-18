// Sprint 8.2 · discovery_q&a — de respostas para configuração.
//
// É esta função que faz o discovery valer a pena: sem ela o formulário só
// encurtou a reunião, e a implantação continua sendo alguém relendo respostas e
// digitando em outra tela.
//
// `maps_to` separa as duas saídas: o que é do agente vira texto de treino (é
// assim que o agente é alimentado), e o resto vira uma lista de conferência para
// montar CRM, canais e time.

import { hasAnswer } from "./evaluate";
import type { DiscoveryAnswers, DiscoveryQuestion, MapsTo, QuestionOption } from "./types";

export interface BriefingItem {
  group: MapsTo;
  label: string;
  answer: string;
}

export interface Briefing {
  agentText: string;
  checklist: BriefingItem[];
}

/** O rótulo da opção, nunca o slug: quem lê o briefing é gente. */
function formatAnswer(options: QuestionOption[], value: unknown): string {
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ");
  return label(String(value ?? ""));
}

export function buildBriefing(
  questions: DiscoveryQuestion[],
  answers: DiscoveryAnswers,
  clienteNome: string,
): Briefing {
  const answered = [...questions]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((q) => hasAnswer(q, answers[q.code]));

  const agentLines = answered
    .filter((q) => q.maps_to === "agent")
    .map((q) => `${q.label}\n${formatAnswer(q.options, answers[q.code])}`);

  const agentText = agentLines.length
    ? `Contexto do atendimento — ${clienteNome}\n\n${agentLines.join("\n\n")}`
    : "";

  const checklist = answered
    .filter((q) => q.maps_to !== "agent")
    .map((q) => ({
      group: q.maps_to,
      label: q.label,
      answer: formatAnswer(q.options, answers[q.code]),
    }));

  return { agentText, checklist };
}
