// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { renderFirstMessage } from "../start-conversation.ts";
import {
  MESSAGE_VARIABLES,
  templateError,
  templateProblems,
} from "./template.ts";

Deno.test("toda variável anunciada tem valor em renderFirstMessage", () => {
  for (const variable of MESSAGE_VARIABLES) {
    const out = renderFirstMessage(`[{{${variable}}}]`, {
      leadName: "Maria Silva",
      leadSource: "Meta Ads",
      tenantName: "Casa Flow",
    });
    assertEquals(out.length > 2, true, `${variable} renderizou vazio`);
  }
});

Deno.test("texto com as variáveis reais é válido", () => {
  const text =
    "Oi {{lead.first_name}}! Aqui é da {{ tenant.name }}. ({{lead.name}}, {{lead.source}})";
  assertEquals(templateProblems(text), []);
  assertEquals(templateError(text), null);
  assertEquals(templateError(""), null);
  assertEquals(templateError(null), null);
});

Deno.test("variável inexistente é sinalizada, não vira string vazia em silêncio", () => {
  assertEquals(templateProblems("Oi {{lead.nome}} e {{lead.nome}}"), [
    { kind: "unknown_variable", variable: "lead.nome" },
  ]);
  const error = templateError("Oi {{lead.nome}}");
  assertStringIncludes(error ?? "", "{{lead.nome}}");
  assertStringIncludes(error ?? "", "{{lead.first_name}}");
});

Deno.test("chaves mal fechadas são sinalizadas", () => {
  for (
    const text of [
      "Oi {{lead.name}",
      "Oi {lead.name}",
      "Oi {{lead name}}",
      "Oi lead.name}}",
    ]
  ) {
    assertEquals(
      templateProblems(text).some((p) => p.kind === "malformed"),
      true,
      text,
    );
  }
});
