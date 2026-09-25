const FROM = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const TO = "aaaaaeeeeiiiiooooouuuucn";
const ACCENTS = new Map([...FROM].map((char, index) => [char, TO[index]]));

/** Espelho de public._outreach_norm_text(text), na migration SE-REV-002. */
export function normalizeForOptOut(value: unknown): string | null {
  const lowered = String(value ?? "").toLowerCase();
  const translated = [...lowered].map((char) => ACCENTS.get(char) ?? char).join(
    "",
  );
  const normalized = translated.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function isOptOut(content: unknown, keywords: unknown): boolean {
  const message = normalizeForOptOut(content);
  if (!message || !Array.isArray(keywords)) return false;
  return keywords.some((keyword) => normalizeForOptOut(keyword) === message);
}
