import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { allowedReturnHost, buildOAuthState, randomToken } from "./meta.ts";

Deno.test("allowedReturnHost - aceita domínios de nicho", () => {
  assertEquals(allowedReturnHost("https://solon.soloventures.com.br"), "solon.soloventures.com.br");
  assertEquals(allowedReturnHost("https://SOLON.soloventures.com.br/"), "solon.soloventures.com.br");
  assertEquals(allowedReturnHost("https://soloventures.com.br"), "soloventures.com.br");
});

Deno.test("allowedReturnHost - recusa domínio estranho, http, porta e lixo", () => {
  for (const o of [
    "https://evil.com",
    "https://soloventures.com.br.evil.com",
    "https://evilsoloventures.com.br",
    "http://solon.soloventures.com.br",
    "https://solon.soloventures.com.br:8443",
    "https://a:b@solon.soloventures.com.br",
    "nada",
    "",
    null,
    42,
  ]) assertEquals(allowedReturnHost(o), null);
});

Deno.test("allowedReturnHost - domínios extras do env", () => {
  const extra = "crm.cliente.com, https://outro.com.br";
  assertEquals(allowedReturnHost("https://crm.cliente.com", extra), "crm.cliente.com");
  assertEquals(allowedReturnHost("https://outro.com.br", extra), "outro.com.br");
  assertEquals(allowedReturnHost("https://x.cliente.com", "crm.cliente.com"), null);
});

Deno.test("buildOAuthState - nonce sem ponto, host depois do 1º ponto", () => {
  const n = randomToken();
  assertEquals(n.includes("."), false);
  assertEquals(buildOAuthState(n, "solon.soloventures.com.br"), `${n}.solon.soloventures.com.br`);
  assertEquals(buildOAuthState(n, null), n);
});
