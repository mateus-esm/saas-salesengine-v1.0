import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveCustomDataKeys } from "./custom-fields.ts";

// ============================================================================
// Sprint 11 · T8 — the address of a custom field value.
//
// A value lives in custom_data[field_id]. Integrations name fields by their
// readable key ("tipo_de_telhado"), so the edge translates. Measured on
// 10/09/2026: 6,242 of 6,368 custom values were stored under keys no pipeline
// declared, invisible on cards and in the dashboard, because every writer picked
// its own address. Nothing undeclared is dropped here — it is kept under the key
// it arrived with and reported, so the data survives and someone can see it.
// ============================================================================

const schema = [
  { field_id: "f-telhado", key: "tipo_de_telhado", label: "Tipo de telhado" },
  { field_id: "f-consumo", key: "consumo_medio_kwh", label: "Consumo" },
  { field_id: "f-velho", key: "campo_apagado", label: "Velho", is_deleted: true },
];

Deno.test("a value named by its key is stored under the field_id", () => {
  const { resolved, undeclared } = resolveCustomDataKeys(schema, { tipo_de_telhado: "Cerâmica" });
  assertEquals(resolved, { "f-telhado": "Cerâmica" });
  assertEquals(undeclared, []);
});

Deno.test("a value already named by field_id stays there", () => {
  const { resolved } = resolveCustomDataKeys(schema, { "f-consumo": 450 });
  assertEquals(resolved, { "f-consumo": 450 });
});

Deno.test("an undeclared key is kept as it came and reported — never dropped", () => {
  const { resolved, undeclared } = resolveCustomDataKeys(schema, { tipo_telhado: "Laje", tipo_de_telhado: "Cerâmica" });
  assertEquals(resolved, { tipo_telhado: "Laje", "f-telhado": "Cerâmica" });
  assertEquals(undeclared, ["tipo_telhado"]);
});

Deno.test("a deleted field is not a destination: its key counts as undeclared", () => {
  const { resolved, undeclared } = resolveCustomDataKeys(schema, { campo_apagado: "x" });
  assertEquals(resolved, { campo_apagado: "x" });
  assertEquals(undeclared, ["campo_apagado"]);
});

Deno.test("no schema: everything passes through as undeclared", () => {
  const { resolved, undeclared } = resolveCustomDataKeys(null, { a: 1 });
  assertEquals(resolved, { a: 1 });
  assertEquals(undeclared, ["a"]);
});
