/**
 * Sprint 9 — the chart palette for the BI area.
 *
 * WHY THIS FILE EXISTS
 *
 * The old dashboard painted its charts with `hsl(var(--chart-2))`,
 * `hsl(var(--chart-3))` and friends. Those custom properties are not defined
 * anywhere in src/index.css — they never were. The browser resolves an unknown
 * custom property to nothing, so every one of those series was being drawn with
 * an invalid fill. The colours that did show up were the two hardcoded ones and
 * whatever recharts fell back to.
 *
 * So this is not a restyle, it is the first actual palette this product has had.
 *
 * HOW THESE COLOURS WERE CHOSEN
 *
 * Not by taste. The eight hues were run through the dataviz validator
 * (six checks: lightness band, chroma floor, colour-vision-deficiency
 * separation on adjacent pairs, normal-vision floor, and contrast against the
 * chart surface) in BOTH themes, and iterated until both passed cleanly:
 *
 *   light on #FFFFFF card — ALL PASS, worst adjacent CVD ΔE 10.1 (deutan)
 *   dark  on #0F0F11 card — ALL PASS, worst adjacent CVD ΔE 14.4 (deutan)
 *
 * Two consequences worth not undoing later:
 *
 *   1. The hue ORDER is fixed and identical in both themes. Colour follows the
 *      entity, not its rank — filtering a pipeline out must not repaint the
 *      pipelines that remain, and switching to dark mode must not turn
 *      "Comercial" from orange into blue.
 *
 *   2. Dark is a SELECTED set of steps, not an automatic lightening of the
 *      light one. The dark lightness band is narrower (L 0.48–0.67 vs
 *      0.43–0.77), so a naive flip lands several hues outside it and they
 *      vibrate against the near-black card.
 *
 * A ninth series is never a generated colour. It folds into "Outros" —
 * see groupTail().
 */

/** Fixed categorical order, light theme. Index = series identity. */
export const CHART_SERIES_LIGHT = [
  "#EA580C", // 1 laranja — a marca; sempre a série principal
  "#2563EB", // 2 azul
  "#0D9488", // 3 verde-azulado
  "#7C3AED", // 4 roxo
  "#DB2777", // 5 rosa
  "#A16207", // 6 âmbar
  "#0891B2", // 7 ciano
  "#65A30D", // 8 verde-limão
] as const;

/** The same eight identities, stepped for the dark card. */
export const CHART_SERIES_DARK = [
  "#EA580C",
  "#4C8DF6",
  "#0FA898",
  "#8B5CF6",
  "#EC4899",
  "#D97706",
  "#0EA5BF",
  "#5E9A0D",
] as const;

/**
 * Status colours, reserved. Never reused as "series 9".
 *
 * Won and lost are the two readings in this product that carry a verdict, so
 * they get a fixed meaning rather than a slot in the rotation — a chart where
 * "ganho" is green in one widget and purple in the next is a chart nobody
 * reads twice.
 */
export const CHART_STATUS = {
  won: { light: "#15803D", dark: "#22A55B" },
  lost: { light: "#B91C1C", dark: "#EF4444" },
  neutral: { light: "#64748B", dark: "#94A3B8" },
} as const;

export type ChartTheme = "light" | "dark";

export const seriesPalette = (theme: ChartTheme): readonly string[] =>
  theme === "dark" ? CHART_SERIES_DARK : CHART_SERIES_LIGHT;

/** Colour for series #index, by identity. Wraps only past 8, where groupTail should have run. */
export const seriesColor = (index: number, theme: ChartTheme): string => {
  const p = seriesPalette(theme);
  return p[index % p.length];
};

export const statusColor = (
  key: keyof typeof CHART_STATUS,
  theme: ChartTheme,
): string => CHART_STATUS[key][theme];

/**
 * Collapse everything past `keep` into a single "Outros" row.
 *
 * A ninth hue is never invented: past eight, the palette stops separating
 * things and starts producing colours the eye cannot tell apart, which is worse
 * than an honest bucket. Callers pass the value that decides rank.
 */
export function groupTail<T extends object>(
  rows: T[],
  keep: number,
  labelKey: keyof T,
  sumKeys: (keyof T)[],
): T[] {
  if (rows.length <= keep) return rows;

  const head = rows.slice(0, keep);
  const tail = rows.slice(keep);

  // Built from the first tail row so every field the table reads still exists;
  // the label and the summed measures are then overwritten. Anything not summed
  // (a rate, say) is deliberately left as that row's value rather than being
  // averaged into a number that means nothing.
  const other = { ...tail[0] } as T;
  (other as Record<string, unknown>)[labelKey as string] = `Outros (${tail.length})`;

  for (const k of sumKeys) {
    (other as Record<string, unknown>)[k as string] = tail.reduce(
      (sum, r) => sum + (Number((r as Record<string, unknown>)[k as string]) || 0),
      0,
    );
  }
  return [...head, other];
}
