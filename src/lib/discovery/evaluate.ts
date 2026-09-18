// Sprint 8.2 · discovery_q&a — progresso e lacunas.
//
// Gêmeo de _discovery_has_answer/_discovery_progress no banco. O banco é quem
// decide de verdade (é ele que recusa um envio incompleto); isto existe para a
// barra de progresso responder no mesmo quadro em que a pessoa digita, sem ida
// ao servidor.

import type { DiscoveryAnswers, DiscoveryBlock, DiscoveryQuestion } from "./types";

/** Lista vazia e texto em branco não são resposta — senão limpar um campo contaria como preenchê-lo. */
export function hasAnswer(question: DiscoveryQuestion, value: unknown): boolean {
  if (value == null) return false;
  if (question.type === "multi") return Array.isArray(value) && value.length > 0;
  return String(value).trim().length > 0;
}

/** Agrupa preservando a ordem de `sort_order`; o bloco nasce onde sua primeira pergunta aparece. */
export function groupIntoBlocks(questions: DiscoveryQuestion[]): DiscoveryBlock[] {
  const blocks: DiscoveryBlock[] = [];
  for (const question of [...questions].sort((a, b) => a.sort_order - b.sort_order)) {
    let block = blocks.find((b) => b.id === question.block);
    if (!block) {
      block = { id: question.block, label: question.block_label, questions: [] };
      blocks.push(block);
    }
    block.questions.push(question);
  }
  return blocks;
}

export interface DiscoveryEvaluation {
  total: number;
  answered: number;
  percent: number;
  complete: boolean;
  missing: { code: string; label: string; block_label: string }[];
}

export function evaluateDiscovery(
  questions: DiscoveryQuestion[],
  answers: DiscoveryAnswers,
): DiscoveryEvaluation {
  const required = questions.filter((q) => q.required);
  const missing = required
    .filter((q) => !hasAnswer(q, answers[q.code]))
    .map((q) => ({ code: q.code, label: q.label, block_label: q.block_label }));
  const answered = required.length - missing.length;
  return {
    total: required.length,
    answered,
    // Sem obrigatórias o formulário está completo por definição — nunca 0/0.
    percent: required.length ? Math.round((answered / required.length) * 100) : 100,
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Os padrões entram só onde ninguém respondeu.
 *
 * É esta função que faz o formulário ser correção em vez de redação: o cliente
 * abre com o funil, o tom e os avisos já marcados. Nunca sobrescreve resposta —
 * um autosave que reaplicasse o padrão desfaria o que a pessoa acabou de mudar.
 */
export function withDefaults(
  questions: DiscoveryQuestion[],
  answers: DiscoveryAnswers,
): DiscoveryAnswers {
  const out: DiscoveryAnswers = { ...answers };
  for (const question of questions) {
    if (question.code in out) continue;
    if (question.default_value == null) continue;
    out[question.code] = question.default_value;
  }
  return out;
}
