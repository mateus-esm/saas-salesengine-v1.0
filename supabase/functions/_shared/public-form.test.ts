import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parsePublicFormRequest, publicFormError } from "./public-form.ts";

// Sprint 11 · T45 — quem abre o formulário só tem o link: o pedido é lido com
// desconfiança e o erro do banco vira uma resposta que a página entende.

const TOKEN = "b".repeat(64);

Deno.test("parsePublicFormRequest: ler é o padrão; enviar precisa dos valores", () => {
  assertEquals(parsePublicFormRequest({ token: TOKEN }), { action: "get", token: TOKEN });
  assertEquals(parsePublicFormRequest({ action: "submit", token: TOKEN, values: { cpf: "1" } }), {
    action: "submit",
    token: TOKEN,
    values: { cpf: "1" },
  });
});

Deno.test("parsePublicFormRequest recusa o que não é do formulário", () => {
  assertEquals(parsePublicFormRequest("x"), { error: "body_must_be_object" });
  assertEquals(parsePublicFormRequest({ token: "curto" }), { error: "token_required" });
  assertEquals(parsePublicFormRequest({ action: "submit", token: TOKEN }), { error: "values_required" });
  assertEquals(parsePublicFormRequest({ action: "apagar", token: TOKEN }), { error: "unknown_action" });
});

Deno.test("publicFormError: campo a corrigir, link que acabou, link que não existe", () => {
  assertEquals(publicFormError("required:cpf"), { status: 422, error: "required", field: "cpf" });
  assertEquals(publicFormError("ERROR: invalid_field:renda"), { status: 422, error: "invalid_field", field: "renda" });
  assertEquals(publicFormError("form_submitted"), { status: 410, error: "form_submitted" });
  assertEquals(publicFormError("form_expired"), { status: 410, error: "form_expired" });
  assertEquals(publicFormError("form_revoked"), { status: 410, error: "form_revoked" });
  assertEquals(publicFormError("form_not_found"), { status: 404, error: "form_not_found" });
  assertEquals(publicFormError("boom"), { status: 500, error: "internal_error" });
});
