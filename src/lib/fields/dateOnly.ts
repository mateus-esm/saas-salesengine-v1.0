// Sprint 11 · Onda 2 — one way to read, show and write a date field.
//
// A date field is a DAY the user picked. Stored values come in two shapes: an ISO
// timestamp (what the modal and the Sprint 11 repair write) and, from older
// writers, a bare "YYYY-MM-DD". `new Date("2026-03-14")` reads the bare shape as
// UTC midnight, which in Brazil is the previous evening — the grid used to show
// every such date one day early. Here a bare date is a local day.

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function localDay(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  // new Date(2026, 1, 31) silently rolls into March; that is not a date.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** A stored value as a Date. A bare "YYYY-MM-DD" is a local day. */
export function parseFieldDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const bare = BARE_DATE.exec(text);
  if (bare) return localDay(Number(bare[1]), Number(bare[2]), Number(bare[3]));
  // Only ISO-like text; "31/02/2026" must not be guessed at.
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dd/MM/yyyy of the local day; "" when the value is not a date. */
export function formatFieldDate(value: unknown): string {
  const d = parseFieldDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}

/** The value for an <input type="date">: YYYY-MM-DD of the local day. */
export function toDateInputValue(value: unknown): string {
  const d = parseFieldDate(value);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
}

/**
 * From an <input type="date"> to what the app stores: local midnight as ISO —
 * the same shape the modal's calendar writes, so both editors agree.
 */
export function fromDateInputValue(raw: string): string | null {
  const bare = BARE_DATE.exec((raw ?? "").trim());
  if (!bare) return null;
  const d = localDay(Number(bare[1]), Number(bare[2]), Number(bare[3]));
  return d ? d.toISOString() : null;
}
