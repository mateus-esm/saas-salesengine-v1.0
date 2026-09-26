// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyEntries,
  type EntryRow,
  ineligibleEntryIds,
} from "./entries.ts";

// Espelha a Casa Flow em produção (2026-09-26): duas "Meta ADS - Cadastro",
// uma órfã (webhook apagado) e a real; "Landing Page" também órfã.
const TEAM = "aa33b576-3959-4a81-8e73-4027039ea2ce";
const OTHER = "939d7dd8-592c-4fda-946e-3568f2909904";
const row = (over: Partial<EntryRow> & { id: string }): EntryRow => ({
  name: "Porta",
  kind: "webhook",
  active: true,
  equipe_id: TEAM,
  webhook_config_id: null,
  webhook_config: null,
  ...over,
});
const ROWS: EntryRow[] = [
  row({
    id: "10a34b8d-1af1-43b5-a016-350ee59f1449",
    name: "Landing Page - Lead Land",
  }),
  row({
    id: "dcf93cfc-fe10-4570-804b-5e542ebde515",
    name: "Meta ADS - Cadastro",
  }),
  row({
    id: "7e6576a0-696f-40a9-841c-d64721979181",
    name: "Manual",
    kind: "manual",
  }),
  row({
    id: "99f0afc8-70c7-4cae-9a4c-1533d674d52a",
    name: "Agente de IA",
    kind: "agent",
  }),
  row({
    id: "5a0349b1-efd4-4d17-b9ab-4f8502ff8574",
    name: "Meta ADS - Cadastro",
    webhook_config_id: "ca544dfe-b643-4df0-addb-345992a2abdc",
    webhook_config: {
      id: "ca544dfe-b643-4df0-addb-345992a2abdc",
      active: true,
      equipe_id: TEAM,
    },
  }),
];

Deno.test("Casa Flow: só a Meta ADS real e a Manual aparecem; órfãs ficam ocultas com motivo", () => {
  const { entries, hidden } = classifyEntries(ROWS, TEAM);
  assertEquals(entries.map((e) => [e.id.slice(0, 8), e.label]), [
    ["7e6576a0", "Manual (Manual)"],
    ["5a0349b1", "Meta ADS - Cadastro (Webhook)"],
  ]);
  assertEquals(hidden.map((h) => [h.id.slice(0, 8), h.reason]), [
    ["10a34b8d", "webhook_deleted"],
    ["dcf93cfc", "webhook_deleted"],
  ]);
});

Deno.test("webhook inativo, porta inativa e webhook de outro time ficam de fora", () => {
  const { entries, hidden } = classifyEntries([
    row({
      id: "a1",
      webhook_config_id: "w1",
      webhook_config: { id: "w1", active: false, equipe_id: TEAM },
    }),
    row({ id: "a2", active: false, kind: "manual" }),
    row({
      id: "a3",
      webhook_config_id: "w3",
      webhook_config: { id: "w3", active: true, equipe_id: OTHER },
    }),
    row({ id: "a4", equipe_id: OTHER, kind: "manual" }),
    row({ id: "a5", active: false, kind: "agent" }),
  ], TEAM);
  assertEquals(entries, []);
  assertEquals(hidden.map((h) => h.reason), [
    "webhook_inactive",
    "inactive",
    "webhook_other_team",
  ]);
});

Deno.test("homônimas válidas ganham o começo do id no rótulo", () => {
  const cfg = (id: string) => ({ id, active: true, equipe_id: TEAM });
  const { entries } = classifyEntries([
    row({
      id: "11111111-aaaa",
      name: "Meta ADS",
      webhook_config_id: "w1",
      webhook_config: cfg("w1"),
    }),
    row({
      id: "22222222-bbbb",
      name: "Meta ADS",
      webhook_config_id: "w2",
      webhook_config: cfg("w2"),
    }),
    row({ id: "33333333-cccc", name: "Meta ADS", kind: "manual" }),
  ], TEAM);
  assertEquals(entries.map((e) => e.label), [
    "Meta ADS (Manual)",
    "Meta ADS (Webhook) · 11111111",
    "Meta ADS (Webhook) · 22222222",
  ]);
});

Deno.test("ineligibleEntryIds aponta a porta órfã", () => {
  const { entries } = classifyEntries(ROWS, TEAM);
  assertEquals(
    ineligibleEntryIds([
      "DCF93CFC-FE10-4570-804B-5E542EBDE515",
      "5a0349b1-efd4-4d17-b9ab-4f8502ff8574",
    ], entries),
    ["DCF93CFC-FE10-4570-804B-5E542EBDE515"],
  );
});
