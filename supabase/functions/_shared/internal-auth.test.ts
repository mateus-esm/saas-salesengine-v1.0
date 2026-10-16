import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isInternalServiceRequest } from "./internal-auth.ts";

Deno.test("análise interna recusa requisição sem segredo configurado ou sem Bearer", () => {
  assertEquals(isInternalServiceRequest(new Headers(), "service-secret"), false);
  assertEquals(isInternalServiceRequest(new Headers({ authorization: "Bearer service-secret" }), undefined), false);
  assertEquals(isInternalServiceRequest(new Headers({ authorization: "service-secret" }), "service-secret"), false);
});
Deno.test("análise interna aceita só a chave de servidor, nunca token público ou de usuário", () => {
  assertEquals(isInternalServiceRequest(new Headers({ authorization: "Bearer service-secret" }), "service-secret"), true);
  assertEquals(isInternalServiceRequest(new Headers({ authorization: "Bearer anon-token" }), "service-secret"), false);
  assertEquals(isInternalServiceRequest(new Headers({ authorization: "Bearer user-token" }), "service-secret"), false);
});
