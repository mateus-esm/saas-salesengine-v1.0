import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundError, isTenantArtifactPath, parseInboundRequest } from "./artifact-inbound.ts";

// SE-DOCPIPE-001 — a entrada por ID é autenticada pelo segredo do tenant, mas o
// corpo é lido com a mesma desconfiança do callback: sem event_id não há
// idempotência, então não entra; arquivo só dentro da pasta do tenant.

const EQUIPE = "939d7dd8-592c-4fda-946e-3568f2909904";
const REC = "a7f3c2d4-0000-4000-8000-000000000001";

Deno.test("update: event_id é obrigatório (é a idempotência)", () => {
  assertEquals(parseInboundRequest({ record_id: REC, status: "signed" }), { ok: false, error: "event_id_required" });
  assertEquals(parseInboundRequest({ record_id: REC, status: "signed", event_id: "  " }), {
    ok: false,
    error: "event_id_required",
  });
  assertEquals(parseInboundRequest({ record_id: REC, status: "signed", event_id: "x".repeat(201) }), {
    ok: false,
    error: "event_id_invalid",
  });
});

Deno.test("update: por record_id, com status, campos e arquivos", () => {
  const r = parseInboundRequest({
    event_id: "clicksign:evt-1",
    record_id: REC,
    status: "signed",
    fields: { clicksign_document_id: "doc-1" },
    files: [{ url: "https://cdn.clicksign.com/assinado.pdf", field: "contrato_assinado" }],
  });
  assertEquals(r, {
    ok: true,
    req: {
      action: "update",
      eventId: "clicksign:evt-1",
      recordId: REC,
      match: null,
      status: "signed",
      fields: { clicksign_document_id: "doc-1" },
      files: [{ url: "https://cdn.clicksign.com/assinado.pdf", field: "contrato_assinado" }],
    },
  });
});

Deno.test("update: por campo (clicksign_document_id), event_id numérico vira texto", () => {
  const r = parseInboundRequest({ event_id: 8231, match: { key: "clicksign_document_id", value: "doc-1" }, status: "signed" });
  assertEquals(r.ok && r.req.action === "update" ? [r.req.eventId, r.req.match] : null, [
    "8231",
    { key: "clicksign_document_id", value: "doc-1", tableId: null },
  ]);
});

Deno.test("update: sem registro, registro inválido, match incompleto", () => {
  assertEquals(parseInboundRequest({ event_id: "e", status: "sent" }), { ok: false, error: "record_required" });
  assertEquals(parseInboundRequest({ event_id: "e", record_id: "1; drop", status: "sent" }), {
    ok: false,
    error: "record_id_invalid",
  });
  assertEquals(parseInboundRequest({ event_id: "e", match: { key: "clicksign_document_id" }, status: "sent" }), {
    ok: false,
    error: "match_needs_key_and_value",
  });
  assertEquals(parseInboundRequest({ event_id: "e", match: { key: "k", value: "v", table_id: "x" }, status: "sent" }), {
    ok: false,
    error: "table_id_invalid",
  });
});

Deno.test("update: corpo sem nada para aplicar é recusado", () => {
  assertEquals(parseInboundRequest({ event_id: "e", record_id: REC }), { ok: false, error: "nothing_to_apply" });
  assertEquals(parseInboundRequest({ event_id: "e", record_id: REC, files: [{}] }), { ok: false, error: "file_needs_url" });
  assertEquals(parseInboundRequest({ event_id: "e", record_id: REC, status: 3 }), { ok: false, error: "status_must_be_text" });
  assertEquals(parseInboundRequest({ action: "delete" }), { ok: false, error: "unknown_action" });
  assertEquals(parseInboundRequest([]), { ok: false, error: "body_must_be_object" });
});

Deno.test("file_url: caminho obrigatório; token só se tiver o formato", () => {
  assertEquals(parseInboundRequest({ action: "file_url" }), { ok: false, error: "path_required" });
  assertEquals(parseInboundRequest({ action: "file_url", path: `${EQUIPE}/t/r/x.pdf`, token: "curto" }), {
    ok: true,
    req: { action: "file_url", path: `${EQUIPE}/t/r/x.pdf`, token: null },
  });
  const token = "b".repeat(64);
  assertEquals(parseInboundRequest({ action: "file_url", path: `${EQUIPE}/t/r/x.pdf`, token }), {
    ok: true,
    req: { action: "file_url", path: `${EQUIPE}/t/r/x.pdf`, token },
  });
});

Deno.test("isTenantArtifactPath: só a pasta do tenant, sem subir diretório", () => {
  assertEquals(isTenantArtifactPath(`${EQUIPE}/tab/rec/id-proposta.pdf`, EQUIPE), true);
  assertEquals(isTenantArtifactPath(`outra-equipe/tab/rec/x.pdf`, EQUIPE), false);
  assertEquals(isTenantArtifactPath(`${EQUIPE}/../outra/x.pdf`, EQUIPE), false);
  assertEquals(isTenantArtifactPath(`${EQUIPE}//x.pdf`, EQUIPE), false);
  assertEquals(isTenantArtifactPath(`${EQUIPE}/`, EQUIPE), false);
  assertEquals(isTenantArtifactPath(`${EQUIPE}\\x.pdf`, EQUIPE), false);
  assertEquals(isTenantArtifactPath(`${EQUIPE}/x.pdf`, ""), false);
});

Deno.test("inboundError: erro do banco vira HTTP", () => {
  assertEquals(inboundError("record_not_found"), { status: 404, error: "record_not_found" });
  assertEquals(inboundError("ERROR: record_ambiguous"), { status: 409, error: "record_ambiguous" });
  assertEquals(inboundError("event_in_progress"), { status: 409, error: "event_in_progress" });
  assertEquals(inboundError("event_id_reused"), { status: 409, error: "event_id_reused" });
  assertEquals(inboundError("invalid_artifact_status"), { status: 422, error: "invalid_artifact_status" });
  assertEquals(inboundError("boom"), { status: 500, error: "internal_error" });
});
