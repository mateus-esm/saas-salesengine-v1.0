import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clientIpFrom, hashClientIp, intakeRejection, parsePublicFormRequest, publicFormError } from "./public-form.ts";

// Sprint 11 · T45 — quem abre o formulário só tem o link: o pedido é lido com
// desconfiança e o erro do banco vira uma resposta que a página entende.

const TOKEN = "b".repeat(64);

Deno.test("parsePublicFormRequest: ler é o padrão; enviar precisa dos valores", () => {
  assertEquals(parsePublicFormRequest({ token: TOKEN }), { action: "get", token: TOKEN });
  assertEquals(parsePublicFormRequest({ action: "submit", token: TOKEN, values: { cpf: "1" } }), {
    action: "submit",
    token: TOKEN,
    values: { cpf: "1" },
    kind: "contract",
  });
});

Deno.test("parsePublicFormRequest: o envio do formulário de ingestão leva kind intake", () => {
  assertEquals(parsePublicFormRequest({ action: "submit", token: TOKEN, kind: "intake", values: { _hp: "" } }), {
    action: "submit",
    token: TOKEN,
    values: { _hp: "" },
    kind: "intake",
  });
  assertEquals(parsePublicFormRequest({ action: "submit", token: TOKEN, kind: "x", values: {} }), { error: "unknown_kind" });
});

Deno.test("publicFormError: excesso de envios vira 429", () => {
  assertEquals(publicFormError("rate_limited"), { status: 429, error: "rate_limited" });
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

Deno.test("clientIpFrom: primeiro salto do x-forwarded-for, ou nulo", () => {
  assertEquals(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assertEquals(clientIpFrom(new Headers()), null);
  assertEquals(clientIpFrom(new Headers({ "x-forwarded-for": "  " })), null);
});

Deno.test("hashClientIp: hex de 64, estável, por formulário, e nunca o IP cru", async () => {
  const a = await hashClientIp("203.0.113.9", TOKEN);
  assertEquals(a?.length, 64);
  assertEquals(a, await hashClientIp("203.0.113.9", TOKEN));
  assertEquals(a === (await hashClientIp("203.0.113.9", "c".repeat(64))), false);
  assertEquals(a === (await hashClientIp("203.0.113.10", TOKEN)), false);
  assertEquals(a?.includes("203"), false);
  assertEquals(await hashClientIp(null, TOKEN), null);
});

Deno.test("intakeRejection: validação recusada vira 422 com o campo; sucesso não é recusa", () => {
  assertEquals(intakeRejection({ ok: false, error: "required:nome" }), { status: 422, error: "required", field: "nome" });
  assertEquals(intakeRejection({ ok: false, error: "invalid_field:nascimento" }), {
    status: 422,
    error: "invalid_field",
    field: "nascimento",
  });
  assertEquals(intakeRejection({ ok: true }), null);
  assertEquals(intakeRejection(null), null);
});
