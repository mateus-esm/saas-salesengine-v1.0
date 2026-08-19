// ============================================================================
// Sprint 7.5 W2 — named training blocks.
//
// The founder wants each training block to carry a personalised name (e.g.
// "BL01", "Política de troca") and for that name to travel WITH the block to
// the provider.
//
// The provider has no title field on a training. `GET /agent/{id}/trainings`
// returns text/image/audio/video/website/document* and nothing name-like —
// `documentName` exists but only for DOCUMENT type. Confirmed in the Sprint 7.2
// live capture and unchanged since.
//
// So the name is encoded INTO the training text as a sentinel first line:
//
//     [[Título: Política de troca]]
//     Trocas em até 30 dias mediante nota fiscal…
//
// Why this shape:
//   • Unambiguous to parse — a bare "Título:" or a markdown "# " heading would
//     collide with real content, and a mis-parse would eat the first line of a
//     tenant's knowledge base.
//   • Harmless to the model — it reads as a labelled section, so it costs
//     nothing in retrieval quality and arguably helps.
//   • Degrades safely — a block written before this convention, or edited
//     directly in the provider's console, simply has no name. It never breaks.
// ============================================================================

const TITLE_RE = /^\[\[Título:\s*([^\]]*)\]\]\r?\n?/;

/** Max name length. Keeps the sentinel from dominating a short block. */
export const TRAINING_TITLE_MAX = 60;

export interface ParsedTraining {
  /** null when the block carries no name. */
  title: string | null;
  /** The block text with the sentinel stripped. */
  content: string;
}

/**
 * Strip a name off stored training text.
 * Text with no sentinel is returned untouched with `title: null`.
 */
export function parseTrainingText(raw: string | null | undefined): ParsedTraining {
  const text = raw ?? "";
  const match = text.match(TITLE_RE);
  if (!match) return { title: null, content: text };
  const title = match[1].trim();
  return {
    title: title || null,
    content: text.slice(match[0].length),
  };
}

/**
 * Attach a name to block text for storage.
 *
 * `]` and newlines are stripped from the name because either would break the
 * sentinel on the way back in — silently splitting a tenant's block.
 */
export function buildTrainingText(title: string | null | undefined, content: string): string {
  const clean = (title ?? "")
    .replace(/[\]\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TRAINING_TITLE_MAX);
  if (!clean) return content;
  return `[[Título: ${clean}]]\n${content}`;
}

/** Positional fallback label ("BL01") for a block the tenant never named. */
export const fallbackBlockLabel = (index: number): string =>
  `BL${String(index + 1).padStart(2, "0")}`;
