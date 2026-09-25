// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { validateEntryIds, validateSteps } from "./api-validation.ts";

const TEAM = "53000000-0000-0000-0000-000000000001";
const OTHER = "53000000-0000-0000-0000-000000000002";
const WEBHOOK = "53000000-0000-0000-0000-000000000101";
const WHATSAPP = "53000000-0000-0000-0000-000000000102";
const FOREIGN = "53000000-0000-0000-0000-000000000103";
const rows = [
  { id: WEBHOOK, equipe_id: TEAM, kind: "webhook" },
  { id: WHATSAPP, equipe_id: TEAM, kind: "whatsapp" },
  { id: FOREIGN, equipe_id: OTHER, kind: "webhook" },
];

Deno.test("upsert recusa porta de outro time e porta WhatsApp", () => {
  assertThrows(
    () => validateEntryIds([FOREIGN], rows, TEAM),
    Error,
    "inexistente",
  );
  assertThrows(
    () => validateEntryIds([WHATSAPP], rows, TEAM),
    Error,
    "whatsapp",
  );
  assertEquals(validateEntryIds([WEBHOOK], rows, TEAM), [WEBHOOK]);
});

Deno.test("upsert recusa offsets fora de ordem e posições descontínuas", () => {
  assertThrows(
    () =>
      validateSteps([
        { position: 0, offset_minutes: 60, message_template: "um" },
        { position: 1, offset_minutes: 30, message_template: "dois" },
      ]),
    Error,
    "crescentes",
  );
  assertThrows(
    () =>
      validateSteps([{
        position: 1,
        offset_minutes: 0,
        message_template: "um",
      }]),
    Error,
    "contínuas",
  );
});
