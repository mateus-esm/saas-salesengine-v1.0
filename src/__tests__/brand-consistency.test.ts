import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "@/config/brand";

/**
 * Sprint 8.2 — o nome antigo não volta.
 *
 * "Sales Engine" era o nome interno de engenharia e tinha vazado para texto que
 * o cliente lê: a tooltip do card do CRM, o parágrafo de abertura da proposta
 * pública, e a lista de entregas da implantação — o texto que ele literalmente
 * aceita ao clicar em "Aceitar proposta".
 *
 * Trocar os literais uma vez não resolve: daqui a dois sprints alguém copia um
 * componente antigo e o nome volta sem ninguém notar. Este guarda é o que
 * impede isso, no mesmo molde do no-provider-branding.test.ts.
 */

const ALLOWLIST: string[] = [
  // Nada por enquanto. Se algum dia precisar entrar aqui, escreva o porquê.
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => join(dir, f).replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // Este próprio arquivo cita o nome antigo para explicar o que proíbe.
    .filter((f) => !f.startsWith("src/__tests__/"));
}

describe("marca", () => {
  it('"Sales Engine" não aparece em nenhuma fonte de src/', () => {
    const offenders = sourceFiles("src").filter(
      (f) => !ALLOWLIST.includes(f) && /sales\s*engine/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("produto e empresa são nomes diferentes", () => {
    // Colapsar os dois quebraria a nota fiscal: quem fatura é a Solo Ventures,
    // o que o cliente usa é o Solo Rev.
    expect(BRAND.product).not.toBe(BRAND.company);
    expect(BRAND.product).toBe("Solo Rev");
    expect(BRAND.company).toBe("Solo Ventures");
  });

  it("o laranja da marca é o mesmo --primary do app", () => {
    // --primary: 28 100% 50% em src/index.css. hsl(28,100%,50%) = #FF7700.
    // Se alguém mudar o token e esquecer o e-mail, o e-mail passa a chegar com
    // uma cor que não é a do produto.
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/--primary:\s*28\s+100%\s+50%/);
    expect(BRAND.color.toUpperCase()).toBe("#FF7700");
  });
});
