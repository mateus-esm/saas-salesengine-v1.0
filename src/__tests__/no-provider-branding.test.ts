import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The provider is an implementation detail. Its brand must never reach the UI.
// Internal service-layer identifiers are allowed and listed here explicitly.
const ALLOWLIST = [
  'src/services/ai-studio/providers/GPTMakerProvider.ts',
  'src/services/ai-studio/ProviderFactory.ts',
  // T12: useMessages.ts carries the internal gptMakerChatId identifier (the
  // camelCase twin of the protected gpt_maker_chat_id field) through the
  // message-fetch flow. It has no user-visible brand strings — only the
  // identifier and a code comment.
  'src/hooks/useMessages.ts',
  // Sprint 8.2: as frases visíveis foram trocadas por "o provedor". O que
  // sobrou é o nome literal da coluna `gpt_maker_agent_id`, exibido em <code>
  // no diagnóstico de "esta equipe não tem agente" — ali o identificador
  // interno É a informação útil para quem vai configurá-lo.
  'src/components/admin/billing/TeamBillingDialog.tsx',
];

// node:fs recursive readdir — the repo has no `glob` dependency and this
// guard is not worth adding one for.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f).replace(/\\/g, '/'))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // T12: the guard is product source, not the test dir. Scanning __tests__
    // flags this very file (its ALLOWLIST mentions GPTMakerProvider).
    .filter((f) => !f.startsWith('src/__tests__/'));
}

describe('provider branding', () => {
  it('never appears in user-visible source', () => {
    const offenders = sourceFiles('src').filter(
      (f) => !ALLOWLIST.includes(f) && /gpt\s*maker/i.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
