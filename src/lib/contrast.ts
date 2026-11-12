// WCAG 2.x contrast helpers. Inputs use the CSS-token format "240 5% 96%".

export function hslToRgb(hsl: string): [number, number, number] {
  const [h, s, l] = hsl
    .split("/")[0]
    .trim()
    .split(/\s+/)
    .map((v) => parseFloat(v));
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) =>
    lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance(hsl: string): number {
  const [r, g, b] = hslToRgb(hsl).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const LIGHT_FOREGROUND = "0 0% 100%";
export const DARK_FOREGROUND = "240 10% 3.9%";

export function pickForeground(bg: string): "0 0% 100%" | "240 10% 3.9%" {
  return contrastRatio(bg, LIGHT_FOREGROUND) >= contrastRatio(bg, DARK_FOREGROUND)
    ? LIGHT_FOREGROUND
    : DARK_FOREGROUND;
}
