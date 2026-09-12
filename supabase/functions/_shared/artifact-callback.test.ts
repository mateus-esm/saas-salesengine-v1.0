import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  artifactFilePath,
  checkAgainstClaim,
  errorCode,
  fileNameFrom,
  httpStatusFor,
  isSafeDownloadUrl,
  parseCallbackBody,
  resolveFileField,
  type CallbackClaim,
} from "./artifact-callback.ts";

// Sprint 11 · T44 — o retorno da automação é público (só o token protege), então
// o corpo é lido com desconfiança e nada é baixado antes de o banco dizer o que o
// registro aceita. artifactFilePath é gêmeo de src/lib/artifactFiles.ts.

const TOKEN = "a".repeat(64);

const claim: CallbackClaim = {
  run_id: "run",
  equipe_id: "eq",
  table_id: "tab",
  record_id: "rec",
  statuses: ["draft", "sent", "accepted", "rejected"],
  writable_keys: ["titulo", "link_pdf"],
  file_columns: [
    { field_id: "f-pdf", key: "pdf" },
    { field_id: "f-anexo", key: "anexo" },
  ],
};

Deno.test("parseCallbackBody lê o corpo completo do contrato v1", () => {
  const r = parseCallbackBody({
    token: TOKEN,
    status: "sent",
    fields: { link_pdf: "https://docs.test/p.pdf" },
    files: [{ url: " https://docs.test/p.pdf ", name: "Proposta.pdf", field: "pdf" }],
  });
  assertEquals(r, {
    ok: true,
    body: {
      token: TOKEN,
      status: "sent",
      fields: { link_pdf: "https://docs.test/p.pdf" },
      files: [{ url: "https://docs.test/p.pdf", name: "Proposta.pdf", field: "pdf" }],
      error: null,
      keepOpen: false,
    },
  });
});

Deno.test("parseCallbackBody: keep_open só quando é true de verdade", () => {
  const open = parseCallbackBody({ token: TOKEN, status: "sent", keep_open: true });
  assertEquals(open.ok && open.body.keepOpen, true);
  const text = parseCallbackBody({ token: TOKEN, keep_open: "true" });
  assertEquals(text.ok && text.body.keepOpen, false);
});

Deno.test("parseCallbackBody aceita só o token (o resto é opcional)", () => {
  assertEquals(parseCallbackBody({ token: TOKEN }), {
    ok: true,
    body: { token: TOKEN, status: null, fields: {}, files: [], error: null, keepOpen: false },
  });
});

Deno.test("parseCallbackBody recusa o que não é do contrato", () => {
  assertEquals(parseCallbackBody(null), { ok: false, error: "body_must_be_object" });
  assertEquals(parseCallbackBody({ token: "curto" }), { ok: false, error: "token_required" });
  assertEquals(parseCallbackBody({ token: TOKEN, status: 3 }), { ok: false, error: "status_must_be_text" });
  assertEquals(parseCallbackBody({ token: TOKEN, fields: [] }), { ok: false, error: "fields_must_be_object" });
  assertEquals(parseCallbackBody({ token: TOKEN, files: [{ name: "x" }] }), { ok: false, error: "file_needs_url" });
  assertEquals(
    parseCallbackBody({ token: TOKEN, files: Array.from({ length: 11 }, () => ({ url: "https://x.test/a" })) }),
    { ok: false, error: "too_many_files" },
  );
});

Deno.test("resolveFileField: a coluna nomeada, ou a primeira de arquivo", () => {
  assertEquals(resolveFileField({ url: "u", field: "anexo" }, claim), "f-anexo");
  assertEquals(resolveFileField({ url: "u" }, claim), "f-pdf");
  assertEquals(resolveFileField({ url: "u", field: "nao_existe" }, claim), null);
  assertEquals(resolveFileField({ url: "u" }, { ...claim, file_columns: [] }), null);
});

Deno.test("checkAgainstClaim barra status do tipo errado, coluna de arquivo inexistente e URL insegura", () => {
  const base = { token: TOKEN, status: null, fields: {}, files: [], error: null, keepOpen: false };
  assertEquals(checkAgainstClaim({ ...base, status: "sent" }, claim), null);
  assertEquals(checkAgainstClaim({ ...base, status: "signed" }, claim), "invalid_artifact_status");
  assertEquals(checkAgainstClaim({ ...base, files: [{ url: "https://x.test/a", field: "nada" }] }, claim), "invalid_file_field");
  assertEquals(checkAgainstClaim({ ...base, files: [{ url: "http://x.test/a" }] }, claim), "unsafe_file_url");
  // O aviso de falha da automação não é validado: fecha a execução como falha.
  assertEquals(checkAgainstClaim({ ...base, status: "signed", error: "APITemplate caiu" }, claim), null);
});

Deno.test("isSafeDownloadUrl: só https público", () => {
  assertEquals(isSafeDownloadUrl("https://api.apitemplate.io/files/p.pdf"), true);
  assertEquals(isSafeDownloadUrl("https://8.8.8.8/p.pdf"), true);
  for (const bad of [
    "http://docs.test/p.pdf",
    "ftp://docs.test/p.pdf",
    "https://localhost/p.pdf",
    "https://127.0.0.1/p.pdf",
    "https://10.0.0.5/p.pdf",
    "https://172.20.1.1/p.pdf",
    "https://192.168.0.1/p.pdf",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/p.pdf",
    "https://user:pass@docs.test/p.pdf",
    "https://metadata.internal/x",
    "não é url",
  ]) {
    assertEquals(isSafeDownloadUrl(bad), false, bad);
  }
});

Deno.test("fileNameFrom: o nome dado, o do cabeçalho, o do caminho; a extensão pelo tipo", () => {
  assertEquals(fileNameFrom("https://x.test/a/b.pdf", null, null, "Proposta.pdf"), "Proposta.pdf");
  assertEquals(fileNameFrom("https://x.test/dl", 'attachment; filename="Contrato Final.pdf"', null), "Contrato Final.pdf");
  assertEquals(fileNameFrom("https://x.test/dl", "attachment; filename*=UTF-8''Proposta%20Jo%C3%A3o.pdf", null), "Proposta João.pdf");
  assertEquals(fileNameFrom("https://x.test/files/proposta%20final.pdf?sig=1", null, null), "proposta final.pdf");
  assertEquals(fileNameFrom("https://x.test/download", null, "application/pdf"), "download.pdf");
  assertEquals(fileNameFrom("https://x.test/", null, null), "arquivo");
});

Deno.test("artifactFilePath: mesma regra do navegador (pasta da equipe primeiro)", () => {
  assertEquals(
    artifactFilePath("eq-1", "tab-2", "rec-3", "Proposta Comercial – João.PDF", "f9"),
    "eq-1/tab-2/rec-3/f9-proposta-comercial-joao.pdf",
  );
});

Deno.test("httpStatusFor/errorCode traduzem o erro do banco", () => {
  assertEquals(httpStatusFor("token_invalid"), 404);
  assertEquals(httpStatusFor("ERROR: token_used"), 410);
  assertEquals(httpStatusFor("token_expired"), 410);
  assertEquals(httpStatusFor("callback_in_progress"), 409);
  assertEquals(httpStatusFor("invalid_artifact_status"), 422);
  assertEquals(httpStatusFor("boom"), 500);
  assertEquals(errorCode("P0002: token_invalid"), "token_invalid");
  assertEquals(errorCode("boom"), "internal_error");
});
