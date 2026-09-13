// Sprint 11 · Onda 6 · T64 — the chat's wire format and the answer's text.
//
// /api/v1/chat answers as Server-Sent Events: `data: {json}` blocks separated by a
// blank line — thread, tools, delta…, done or error. The answer is plain text
// with a small markdown: **bold**, [links](/crm?...), and "- " list lines. That is
// all the Copilot is asked to write, so that is all this renders (no HTML).

export type ChatEvent =
  | { type: "thread"; thread_id: string }
  | { type: "tools"; tools: { name: string; label: string }[] }
  | { type: "delta"; text: string }
  | { type: "done"; message_id: string; thread_id: string; links: string[] }
  | { type: "error"; message: string };

/** Split what arrived so far into complete events and the unfinished rest. */
export function parseSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as ChatEvent);
    } catch {
      // a broken block is skipped; the stream goes on
    }
  }
  return { events, rest };
}

export interface Span {
  text: string;
  bold?: boolean;
  href?: string;
}

export interface Block {
  kind: "p" | "li";
  spans: Span[];
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Only app paths and https links are followed; anything else stays text. */
const safeHref = (href: string) => (href.startsWith("/") || href.startsWith("https://") ? href : undefined);

export function inlineSpans(line: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index! > last) spans.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else {
      const href = safeHref(m[3]);
      spans.push(href ? { text: m[2], href } : { text: m[2] });
    }
    last = m.index! + m[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

/** The answer as paragraphs and list items. */
export function renderBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    blocks.push(item ? { kind: "li", spans: inlineSpans(item[1]) } : { kind: "p", spans: inlineSpans(line.trim()) });
  }
  return blocks;
}

export type Group = { kind: "p"; spans: Span[] } | { kind: "ul"; items: Span[][] };

/** Consecutive list items become one list. */
export function groupBlocks(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.kind === "li") {
      if (last?.kind === "ul") last.items.push(b.spans);
      else groups.push({ kind: "ul", items: [b.spans] });
    } else {
      groups.push({ kind: "p", spans: b.spans });
    }
  }
  return groups;
}

export const CHAT_SUGGESTIONS = ["Como foi hoje?", "Onde devo focar?", "ROI do mês", "Por que perdemos?"];
