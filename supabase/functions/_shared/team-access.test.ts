// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  checkTarget,
  highestRole,
  isAssignableRole,
  seatErrorMessage,
} from "./team-access.ts";

Deno.test("dono não concede owner nem super_admin", () => {
  assertEquals(isAssignableRole("user"), true);
  assertEquals(isAssignableRole("admin"), true);
  assertEquals(isAssignableRole("owner"), false);
  assertEquals(isAssignableRole("super_admin"), false);
  assertEquals(isAssignableRole(undefined), false);
});

Deno.test("não altera a si mesmo nem owner/super_admin", () => {
  assertEquals(checkTarget("a", "a", "admin").ok, false);
  assertEquals(checkTarget("a", "b", "owner").ok, false);
  assertEquals(checkTarget("a", "b", "super_admin").ok, false);
  assertEquals(checkTarget("a", "b", "admin").ok, true);
  assertEquals(checkTarget("a", "b", "user").ok, true);
});

Deno.test("papel mais alto vence", () => {
  assertEquals(highestRole([]), "user");
  assertEquals(highestRole(["user", "admin"]), "admin");
  assertEquals(highestRole(["owner", "user"]), "owner");
});

Deno.test("erro de assento vira mensagem do dono", () => {
  assertEquals(
    seatErrorMessage("seat_limit_reached: 3 de 3 assentos em uso")?.includes("Limite"),
    true,
  );
  assertEquals(seatErrorMessage("outro erro"), null);
});
