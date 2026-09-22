import { describe, expect, it } from "vitest";

import { groupBlocks, inlineSpans, parseSse, renderBlocks } from "../copilotChat";
import {
  activityLine,
  bulkResolveText,
  dealHref,
  groupByDay,
  groupByWhy,
  resolveText,
  statusLabel,
  summarizeBulk,
  undoText,
  whyCounts,
  whyLabel,
} from "../copilotFeed";

describe("the chat's wire format", () => {
  it("splits complete events and keeps the unfinished rest", () => {
    const { events, rest } = parseSse(
      'data: {"type":"thread","thread_id":"t1"}\n\ndata: {"type":"delta","text":"Hoje "}\n\ndata: {"type":"delta","te',
    );
    expect(events).toEqual([{ type: "thread", thread_id: "t1" }, { type: "delta", text: "Hoje " }]);
    expect(rest).toBe('data: {"type":"delta","te');
    expect(parseSse(rest + 'xt":"12"}\n\n').events).toEqual([{ type: "delta", text: "12" }]);
  });

  it("a broken block is skipped", () => {
    expect(parseSse("data: {oops\n\ndata: {\"type\":\"error\",\"message\":\"x\"}\n\n").events).toEqual([
      { type: "error", message: "x" },
    ]);
  });
});

describe("the answer's text", () => {
  it("bold and app links; other links stay text", () => {
    expect(inlineSpans("**12 leads** — [Ver na tabela](/crm?tab=pipeline&view=table)")).toEqual([
      { text: "12 leads", bold: true },
      { text: " — " },
      { text: "Ver na tabela", href: "/crm?tab=pipeline&view=table" },
    ]);
    const unsafe = inlineSpans("[clique](javascript:alert(1))");
    expect(unsafe[0]).toEqual({ text: "clique" });
    expect(unsafe.some((span) => span.href)).toBe(false);
  });

  it("paragraphs and list items", () => {
    const blocks = renderBlocks("Em setembro:\n\n- 12 leads\n2. 3 ganhos\n");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "li", "li"]);
    expect(blocks[2].spans[0].text).toBe("3 ganhos");
  });

  it("consecutive list items become one list", () => {
    const groups = groupBlocks(renderBlocks(["Foco:", "- Ana", "- Bia", "Depois:", "- Caio"].join(String.fromCharCode(10))));
    expect(groups.map((g) => (g.kind === "ul" ? g.items.length : "p"))).toEqual(["p", 2, "p", 1]);
  });
});

describe("the feed in words", () => {
  it("why it waits, and what undo/resolve answered", () => {
    expect(whyLabel("low_confidence")).toBe("confiança baixa");
    expect(whyLabel("risky")).toBe("pede aprovação");
    expect(undoText({ ok: true })).toBeNull();
    expect(undoText({ ok: false, reason: "changed_since" })).toMatch(/Alguém mexeu depois/);
    expect(resolveText({ ok: false, reason: "stale" })).toMatch(/desatualizada/);
  });

  it("groups by local day, newest first", () => {
    const now = new Date(2026, 8, 14, 15, 0);
    const groups = groupByDay(
      [
        { at: new Date(2026, 8, 13, 10).toISOString() },
        { at: new Date(2026, 8, 14, 9).toISOString() },
        { at: new Date(2026, 8, 10, 9).toISOString() },
        { at: new Date(2026, 8, 14, 11).toISOString() },
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["Hoje", 2], ["Ontem", 1], ["10/09", 1]]);
  });

  it("the home's line: what waits for you and what was done today", () => {
    const item = { id: "d", status: "pending_approval", at: "", label: null, opportunity_id: "o", pipeline_id: null, contact: null };
    expect(activityLine({ pending: [item, item, item], today: { applied: 12, read: 5 } })).toEqual({
      text: "3 para aprovar · 12 ações hoje",
      attention: true,
    });
    expect(activityLine({ pending: [], today: { applied: 1, read: 0 } })).toEqual({
      text: "Nada para aprovar · 1 ação hoje",
      attention: false,
    });
    expect(activityLine({ pending: [], today: { applied: 0, read: 0 } }).text).toBe("Nada para aprovar · nenhuma ação hoje");
  });

  it("a feed line opens the deal's pipeline filtered to the contact", () => {
    expect(dealHref({ pipeline_id: "p1", contact: "Maria Souza" })).toBe("/crm?tab=pipeline&pipeline=p1&q=Maria%20Souza");
    expect(dealHref({ pipeline_id: null, contact: "x" })).toBeNull();
  });

  it("pending reads as 'aguardando'", () => {
    expect(statusLabel("pending_approval")).toBe("aguardando");
    expect(statusLabel("auto_applied")).toBe("feito");
  });
});

describe("the approval queue", () => {
  const item = (id: string, why: string | null) => ({
    id,
    status: "pending_approval",
    at: new Date(2026, 8, 14, 10).toISOString(),
    label: null,
    why,
    opportunity_id: "o",
    pipeline_id: "p1",
    contact: null,
  });

  it("groups by why it waits, risk first, unknown reasons last", () => {
    const groups = groupByWhy([
      item("a", "suggest_mode"),
      item("b", "risky"),
      item("c", "risky"),
      item("d", "something_new"),
      item("e", null),
    ]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["pede aprovação", 2],
      ["linha no modo sugerir", 1],
      ["something_new", 1],
      ["outras", 1],
    ]);
  });

  it("counts what each filter chip shows", () => {
    expect(whyCounts([item("a", "risky"), item("b", "low_confidence"), item("c", "risky")])).toEqual([
      { why: "risky", label: "pede aprovação", count: 2 },
      { why: "low_confidence", label: "confiança baixa", count: 1 },
    ]);
  });

  it("folds a bulk round into a summary, one thrown call at a time", () => {
    expect(
      summarizeBulk([
        { ok: true },
        { ok: false, reason: "stale" },
        { ok: false, reason: "not_pending" },
        null, // crm_copilot_resolve raised — decision or deal gone
        { ok: false, reason: "something_new" },
      ]),
    ).toEqual({ total: 5, ok: 1, stale: 1, notPending: 1, failed: 2 });
    expect(summarizeBulk([])).toEqual({ total: 0, ok: 0, stale: 0, notPending: 0, failed: 0 });
  });

  it("says a clean bulk round in one sentence", () => {
    expect(bulkResolveText(true, { total: 3, ok: 3, stale: 0, notPending: 0, failed: 0 })).toEqual({
      tone: "success",
      text: "3 aplicadas.",
    });
    expect(bulkResolveText(false, { total: 1, ok: 1, stale: 0, notPending: 0, failed: 0 }).text).toBe("1 recusada.");
  });

  it("names what went wrong without hiding what worked", () => {
    const mixed = bulkResolveText(true, { total: 4, ok: 2, stale: 1, notPending: 0, failed: 1 });
    expect(mixed.tone).toBe("warning");
    expect(mixed.text).toBe("2 aplicadas; 1 desatualizada, 1 com erro.");

    const none = bulkResolveText(true, { total: 1, ok: 0, stale: 1, notPending: 0, failed: 0 });
    expect(none.tone).toBe("error");
    expect(none.text).toBe("Nenhuma: 1 desatualizada.");
  });
});
