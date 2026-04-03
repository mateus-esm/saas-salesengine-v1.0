/**
 * PromptBuilder — Converte respostas de formulário em string de comportamento
 * para o campo `behavior` da API do GPT Maker (limite: 3000 chars).
 */

export interface BehaviorAnswers {
  agentName?: string;
  tone?: string;          // ex: "formal", "amigável", "técnico"
  persona?: string;       // descrição da persona
  restrictions?: string;  // o que o agente NÃO deve fazer
  goals?: string;         // objetivos principais do agente
  responseStyle?: string; // como estruturar respostas
  language?: string;      // idioma padrão
  escalation?: string;    // quando escalar para humano
}

const SECTION_SEPARATOR = "\n\n";

export function buildBehaviorPrompt(answers: BehaviorAnswers): string {
  const sections: string[] = [];

  if (answers.agentName) {
    sections.push(`## Identidade\nVocê é ${answers.agentName}.`);
  }

  if (answers.tone || answers.persona) {
    const parts: string[] = [];
    if (answers.tone) parts.push(`Tom de voz: ${answers.tone}.`);
    if (answers.persona) parts.push(answers.persona);
    sections.push(`## Persona\n${parts.join(' ')}`);
  }

  if (answers.goals) {
    sections.push(`## Objetivos\n${answers.goals}`);
  }

  if (answers.responseStyle) {
    sections.push(`## Estilo de Resposta\n${answers.responseStyle}`);
  }

  if (answers.restrictions) {
    sections.push(`## Restrições\n${answers.restrictions}`);
  }

  if (answers.language) {
    sections.push(`## Idioma\nResponda sempre em ${answers.language}.`);
  }

  if (answers.escalation) {
    sections.push(`## Escalada\n${answers.escalation}`);
  }

  const result = sections.join(SECTION_SEPARATOR);

  // Hard limit: 3000 chars
  return result.slice(0, 3000);
}

export function countChars(answers: BehaviorAnswers): number {
  return buildBehaviorPrompt(answers).length;
}
