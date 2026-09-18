// Sprint 8.2 · discovery_q&a — a porta de JSON.
//
// Quem já tem uma IA com o contexto da própria empresa não deveria redigitar o
// que ela já sabe: copia as perguntas, responde lá, cola aqui.
//
// A volta NUNCA envia sozinha. A IA do cliente vai inventar um preço com
// confiança total, e preço inventado vira script do agente que fala com o
// cliente final dele. Por isso aqui só se produz um RASCUNHO: o que foi
// importado fica destacado na tela e alguém confirma. Código que não existe e
// opção que não existe são descartados e RELATADOS — um import silencioso que
// come metade das respostas é pior que um erro.

import type { DiscoveryAnswers, DiscoveryQuestion } from "./types";

export interface ExportedQuestion {
  code: string;
  pergunta: string;
  ajuda: string | null;
  tipo: DiscoveryQuestion["type"];
  obrigatoria: boolean;
  /** Valores aceitos. Vazio = texto livre. */
  opcoes: string[];
  escolha_ate: number | null;
}

export interface DiscoveryExport {
  versao: 1;
  instrucoes: string;
  formato_esperado: { respostas: Record<string, unknown> };
  perguntas: ExportedQuestion[];
}

const INSTRUCOES = [
  "Você vai responder a um questionário sobre a empresa do usuário.",
  "Responda como a empresa dele, com dados reais — não invente preço, prazo nem promessa.",
  "Se algo não estiver definido, responda exatamente: a confirmar.",
  'Devolva SÓ um JSON com a chave "respostas", no formato de "formato_esperado", usando os mesmos "code".',
  'Em perguntas com "opcoes", use exatamente um dos valores listados.',
  'Em perguntas de tipo "multi", devolva uma lista, respeitando "escolha_ate".',
].join(" ");

export function buildQuestionExport(questions: DiscoveryQuestion[]): DiscoveryExport {
  return {
    versao: 1,
    instrucoes: INSTRUCOES,
    formato_esperado: {
      respostas: Object.fromEntries(questions.map((q) => [q.code, q.type === "multi" ? [] : ""])),
    },
    perguntas: questions.map((q) => ({
      code: q.code,
      pergunta: q.label,
      ajuda: q.help,
      tipo: q.type,
      obrigatoria: q.required,
      // 'select_other' aceita texto livre: listar as opções ali faria a IA achar
      // que só elas valem, e é justamente o campo do funil que não é nenhum dos nossos.
      opcoes: q.type === "select" || q.type === "multi" ? q.options.map((o) => o.value) : [],
      escolha_ate: q.max_select,
    })),
  };
}

export type ImportError = "json_invalido" | "formato_invalido" | "nenhuma_resposta";

export interface ImportResult {
  answers: DiscoveryAnswers;
  imported: string[];
  ignored: string[];
}

export function parseAnswerImport(
  questions: DiscoveryQuestion[],
  raw: string,
): ImportResult | { error: ImportError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "json_invalido" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "formato_invalido" };
  }

  // Aceita tanto o envelope que exportamos quanto o objeto de respostas cru:
  // metade das IAs devolve um, metade devolve o outro.
  const envelope = parsed as Record<string, unknown>;
  const source =
    envelope.respostas && typeof envelope.respostas === "object" && !Array.isArray(envelope.respostas)
      ? (envelope.respostas as Record<string, unknown>)
      : envelope;

  const byCode = new Map(questions.map((q) => [q.code, q]));
  const answers: DiscoveryAnswers = {};
  const imported: string[] = [];
  const ignored: string[] = [];

  for (const [code, value] of Object.entries(source)) {
    const question = byCode.get(code);
    if (!question) {
      ignored.push(code);
      continue;
    }

    const allowed = question.options.map((o) => o.value);

    if (question.type === "multi") {
      if (!Array.isArray(value)) {
        ignored.push(code);
        continue;
      }
      let picked = value.map(String).filter((v) => allowed.includes(v));
      if (question.max_select) picked = picked.slice(0, question.max_select);
      if (picked.length === 0) {
        ignored.push(code);
        continue;
      }
      answers[code] = picked;
      imported.push(code);
      continue;
    }

    const text = value == null ? "" : String(value).trim();
    if (!text) {
      ignored.push(code);
      continue;
    }
    // 'select' só aceita a lista; 'select_other' aceita texto livre de propósito.
    if (question.type === "select" && !allowed.includes(text)) {
      ignored.push(code);
      continue;
    }
    answers[code] = text;
    imported.push(code);
  }

  if (imported.length === 0) return { error: "nenhuma_resposta" };
  return { answers, imported, ignored };
}
