import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { pickRedirectUri } from "./meta.ts";

const FB = "https://rev.soloventures.com.br/integracoes/meta/callback";

Deno.test("pickRedirectUri - volta para o domínio do nicho", () => {
  assertEquals(pickRedirectUri("https://solon.soloventures.com.br", FB), "https://solon.soloventures.com.br/integracoes/meta/callback");
  assertEquals(pickRedirectUri("https://SOLON.soloventures.com.br/", FB), "https://solon.soloventures.com.br/integracoes/meta/callback");
  assertEquals(pickRedirectUri("https://soloventures.com.br", FB), "https://soloventures.com.br/integracoes/meta/callback");
});

Deno.test("pickRedirectUri - recusa domínio estranho, http, porta e lixo", () => {
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
  ]) assertEquals(pickRedirectUri(o, FB), FB);
});

Deno.test("pickRedirectUri - domínios extras do env", () => {
  assertEquals(pickRedirectUri("https://crm.cliente.com", FB, "crm.cliente.com, https://outro.com.br"), "https://crm.cliente.com/integracoes/meta/callback");
  assertEquals(pickRedirectUri("https://outro.com.br", FB, "crm.cliente.com, https://outro.com.br"), "https://outro.com.br/integracoes/meta/callback");
  assertEquals(pickRedirectUri("https://x.cliente.com", FB, "crm.cliente.com"), FB);
});
