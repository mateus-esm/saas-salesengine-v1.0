import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { discoveryError, parseDiscoveryRequest } from "./public-discovery.ts";

// Sprint 8.2 · discovery_q&a · T73 — quem abre o discovery só tem o link.

const TOKEN = "a".repeat(64);

Deno.test("parseDiscoveryRequest: ler é o padrão; salvar precisa das respostas", () => {
  assertEquals(parseDiscoveryRequest({ token: TOKEN }), { action: "get", token: TOKEN });
  assertEquals(parseDiscoveryRequest({ action: "save", token: TOKEN, answers: { "agente.nome": "Sol" } }), {
    action: "save", token: TOKEN, answers: { "agente.nome": "Sol" },
  });
  assertEquals(parseDiscoveryRequest({ action: "submit", token: TOKEN }), { action: "submit", token: TOKEN });
});

Deno.test("parseDiscoveryRequest recusa o que não é do discovery", () => {
  assertEquals(parseDiscoveryRequest("x"), { error: "body_must_be_object" });
  assertEquals(parseDiscoveryRequest({ token: "curto" }), { error: "token_required" });
  assertEquals(parseDiscoveryRequest({ action: "save", token: TOKEN }), { error: "answers_required" });
  assertEquals(parseDiscoveryRequest({ action: "apagar", token: TOKEN }), { error: "unknown_action" });
});

Deno.test("discoveryError: campo a corrigir, link que acabou, link que não existe", () => {
  assertEquals(discoveryError("required:empresa.o_que_vende"), {
    status: 422, error: "required", field: "empresa.o_que_vende",
  });
  assertEquals(discoveryError("invalid_option:funil.ticket"), {
    status: 422, error: "invalid_option", field: "funil.ticket",
  });
  assertEquals(discoveryError("discovery_expired"), { status: 410, error: "discovery_expired" });
  assertEquals(discoveryError("discovery_submitted"), { status: 410, error: "discovery_submitted" });
  assertEquals(discoveryError("discovery_not_found"), { status: 404, error: "discovery_not_found" });
  assertEquals(discoveryError("boom"), { status: 500, error: "internal_error" });
});
