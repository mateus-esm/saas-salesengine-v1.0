import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MESSAGE_VARIABLES, renderPreview, templateProblems } from "./message-variables";

describe("message-variables", () => {
  it("é a mesma lista que o servidor valida e renderiza", () => {
    const server = readFileSync("supabase/functions/_shared/outreach/template.ts", "utf8");
    const block = server.match(/MESSAGE_VARIABLES = \[([\s\S]*?)\] as const/)?.[1] ?? "";
    const serverKeys = [...block.matchAll(/"([a-z_.]+)"/g)].map((m) => m[1]);
    expect(serverKeys).toEqual(MESSAGE_VARIABLES.map((v) => v.key));
  });

  it("sinaliza variável inexistente e chaves mal fechadas", () => {
    expect(templateProblems("Oi {{lead.first_name}}, da {{tenant.name}}")).toEqual([]);
    expect(templateProblems("Oi {{lead.nome}}")).toEqual([{ kind: "unknown_variable", variable: "lead.nome" }]);
    expect(templateProblems("Oi {lead.name}")[0]?.kind).toBe("malformed");
    expect(templateProblems("Oi {{lead.name}")[0]?.kind).toBe("malformed");
  });

  it("preview igual ao renderFirstMessage do servidor", () => {
    expect(
      renderPreview("Oi {{lead.first_name}}! Aqui é da {{tenant.name}}.", {
        leadName: "Maria Souza",
        leadSource: "Meta Ads",
        tenantName: "Casa Flow",
      }),
    ).toBe("Oi Maria! Aqui é da Casa Flow.");
  });
});
