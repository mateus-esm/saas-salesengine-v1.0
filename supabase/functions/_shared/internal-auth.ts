import { safeEqual } from "./asaas.ts";

/** Chamadas de servidor para servidor: um JWT de usuário não autoriza acesso global. */
export function isInternalServiceRequest(headers: Pick<Headers, "get">, serviceKey: string | undefined): boolean {
  const authorization = headers.get("authorization") ?? "";
  if (!serviceKey || !authorization.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7), serviceKey);
}
