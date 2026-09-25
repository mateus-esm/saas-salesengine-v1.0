// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { classifyGptMakerResult, classifySoloResult } from "./classify.ts";
import { isOptOut, normalizeForOptOut } from "./optout.ts";
import { nextAllowedSendTime, validateSendWindow } from "./schedule.ts";

const WINDOW = { start: "08:00", end: "20:00", timezone: "America/Sao_Paulo" };

Deno.test("janela: dentro preserva o instante; antes e depois adiam para 08:00 local", () => {
  const inside = new Date("2026-09-25T15:00:00Z"); // 12:00 em São Paulo
  assertEquals(
    nextAllowedSendTime(inside, WINDOW).toISOString(),
    inside.toISOString(),
  );
  assertEquals(
    nextAllowedSendTime(new Date("2026-09-25T09:00:00Z"), WINDOW).toISOString(),
    "2026-09-25T11:00:00.000Z",
  );
  assertEquals(
    nextAllowedSendTime(new Date("2026-09-26T00:00:00Z"), WINDOW).toISOString(),
    "2026-09-26T11:00:00.000Z",
  );
});

Deno.test("janela: fim é exclusivo e janela cruzando meia-noite é recusada", () => {
  assertEquals(
    nextAllowedSendTime(new Date("2026-09-25T23:00:00Z"), WINDOW).toISOString(),
    "2026-09-26T11:00:00.000Z",
  );
  assertThrows(
    () =>
      validateSendWindow({
        start: "20:00",
        end: "08:00",
        timezone: "America/Sao_Paulo",
      }),
    Error,
    "não pode cruzar",
  );
});

Deno.test("janela: conversão respeita horário de verão de outro fuso", () => {
  const ny = { start: "08:00", end: "20:00", timezone: "America/New_York" };
  assertEquals(
    nextAllowedSendTime(new Date("2026-01-15T10:00:00Z"), ny).toISOString(),
    "2026-01-15T13:00:00.000Z",
  );
  assertEquals(
    nextAllowedSendTime(new Date("2026-07-15T10:00:00Z"), ny).toISOString(),
    "2026-07-15T12:00:00.000Z",
  );
});

Deno.test("opt-out TS espelha SQL: mensagem inteira, acento, caixa e pontuação", () => {
  const keywords = ["sair", "parar", "descadastrar"];
  assertEquals(normalizeForOptOut("  SAÍR!!! "), "sair");
  assertEquals(isOptOut("  SAÍR!!! ", keywords), true);
  assertEquals(isOptOut("não quero parar", keywords), false);
  assertEquals(isOptOut("", keywords), false);
});

Deno.test("GPT Maker: sucesso, recusa transitória, recusa definitiva e timeout", () => {
  assertEquals(
    classifyGptMakerResult({ status: 200, accepted: true }).outcome,
    "sent",
  );
  assertEquals(classifyGptMakerResult({ status: 200, accepted: false }), {
    outcome: "rejected",
    retryable: false,
    errorCode: "provider_rejected",
  });
  assertEquals(classifyGptMakerResult({ status: 503 }).retryable, true);
  assertEquals(classifyGptMakerResult({ status: 403 }).retryable, false);
  const timeout = new Error("The signal has been aborted");
  timeout.name = "AbortError";
  assertEquals(
    classifyGptMakerResult({ status: null, error: timeout }).outcome,
    "unknown",
  );
  assertEquals(
    classifyGptMakerResult({ status: null, error: new Error("DNS") }).outcome,
    "unreachable",
  );
});

Deno.test("Solo: só key.id confirma; 4xx recusa, 503 retry, abort é incerto", () => {
  assertEquals(
    classifySoloResult({ ok: true, providerMessageId: "M1" }).outcome,
    "sent",
  );
  assertEquals(classifySoloResult({ ok: true }).outcome, "unknown");
  assertEquals(
    classifySoloResult({ ok: false, error: "Solo API returned 400: bad" })
      .retryable,
    false,
  );
  assertEquals(
    classifySoloResult({ ok: false, error: "Solo API returned 503: down" })
      .retryable,
    true,
  );
  assertEquals(
    classifySoloResult({
      ok: false,
      error: "Solo API error: operation aborted",
    }).outcome,
    "unknown",
  );
  assertEquals(
    classifySoloResult({ ok: false, error: "Solo API error: dns" }).outcome,
    "unreachable",
  );
});
