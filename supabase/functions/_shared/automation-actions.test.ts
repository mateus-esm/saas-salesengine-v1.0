import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveInboundAction, valueAtPath } from "./automation-actions.ts";

Deno.test("valueAtPath - caminho pontilhado e ausente", () => {
  assertEquals(valueAtPath({ a: { b: 3 } }, "a.b"), 3);
  assertEquals(valueAtPath({ a: 1 }, "a.b"), undefined);
  assertEquals(valueAtPath({}, ""), undefined);
});

Deno.test("move_stage - etapa literal", () => {
  assertEquals(
    resolveInboundAction({ type: "move_stage", params: { stage_id: "s1" } }, {}),
    { ok: true, action: { type: "move_stage", params: { stage_id: "s1" } } },
  );
});

Deno.test("move_stage - etapa vem do payload pelo mapa (sem caixa/espaços)", () => {
  const action = { type: "move_stage", params: { source: "status", map: { fechado: "s-won", perdido: "s-lost" } } };
  assertEquals(
    resolveInboundAction(action, { status: " Fechado " }),
    { ok: true, action: { type: "move_stage", params: { stage_id: "s-won" } } },
  );
  assertEquals(resolveInboundAction(action, { status: "outro" }), { ok: false, reason: "stage_unmapped" });
  assertEquals(resolveInboundAction(action, {}), { ok: false, reason: "source_missing" });
});

Deno.test("update_field - valor fixo e valor do payload", () => {
  assertEquals(
    resolveInboundAction({ type: "update_field", params: { field: "motivo", value: "x" } }, {}),
    { ok: true, action: { type: "update_field", params: { field: "motivo", value: "x" } } },
  );
  assertEquals(
    resolveInboundAction({ type: "update_field", params: { field: "kwh", source: "dados.kwh" } }, { dados: { kwh: 420 } }),
    { ok: true, action: { type: "update_field", params: { field: "kwh", value: 420 } } },
  );
  assertEquals(
    resolveInboundAction({ type: "update_field", params: { field: "kwh", source: "dados.kwh" } }, {}),
    { ok: false, reason: "source_missing" },
  );
  assertEquals(resolveInboundAction({ type: "update_field", params: {} }, {}), { ok: false, reason: "field_required" });
});

Deno.test("set_responsible e call_webhook", () => {
  assertEquals(
    resolveInboundAction({ type: "set_responsible", params: { source: "vendedor", map: { ana: "u1" } } }, { vendedor: "Ana" }),
    { ok: true, action: { type: "set_responsible", params: { user_id: "u1" } } },
  );
  assertEquals(
    resolveInboundAction({ type: "call_webhook", params: { webhook_id: "w1" } }, {}),
    { ok: true, action: { type: "call_webhook", params: { webhook_id: "w1" } } },
  );
});

Deno.test("ação ausente ou inválida", () => {
  assertEquals(resolveInboundAction(null, {}), { ok: false, reason: "no_action" });
  assertEquals(resolveInboundAction({ type: "explode" }, {}), { ok: false, reason: "unknown_type" });
});
