import { describe, expect, it } from "vitest";

import { groupBlocks, inlineSpans, parseSse, renderBlocks } from "../copilotChat";
import { dealHref, groupByDay, resolveText, undoText, whyLabel } from "../copilotFeed";

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

  it("a feed line opens the deal's pipeline filtered to the contact", () => {
    expect(dealHref({ pipeline_id: "p1", contact: "Maria Souza" })).toBe("/crm?tab=pipeline&pipeline=p1&q=Maria%20Souza");
    expect(dealHref({ pipeline_id: null, contact: "x" })).toBeNull();
  });
});
