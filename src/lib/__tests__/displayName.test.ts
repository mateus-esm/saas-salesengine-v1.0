import { describe, expect, it } from "vitest";
import { formatBrPhone, formatDisplayName, isTechnicalId, isTechnicalPhone } from "@/lib/displayName";

/**
 * SE-LID-001 — the UI half of the Meta `@lid` fix.
 *
 * The edge functions stopped writing technical ids (see
 * supabase/functions/_shared/lead-identity.ts), but historical rows still carry
 * them: a Casa Flow lead created on 2026-09-17 has
 *
 *   name  = "Lead 186432031355045@lid"
 *   phone = "186432031355045@lid"
 *
 * `isTechnicalId` already masked the name. These tests pin the second half:
 * the *phone* is not a phone either, and formatting it produced
 * "+186432031355045" on screen.
 */
describe("isTechnicalPhone", () => {
  it("recognises the LID that reached the CRM", () => {
    expect(isTechnicalPhone("186432031355045@lid")).toBe(true);
    expect(isTechnicalPhone(" 186432031355045@LID ")).toBe(true);
    // Bare LID, as stored by the writers that strip the suffix.
    expect(isTechnicalPhone("186432031355045")).toBe(true);
  });

  it("recognises group and broadcast identifiers", () => {
    expect(isTechnicalPhone("120363000000000000@g.us")).toBe(true);
    expect(isTechnicalPhone("status@broadcast")).toBe(true);
  });

  it("leaves real numbers alone", () => {
    expect(isTechnicalPhone("5585996487923")).toBe(false);
    expect(isTechnicalPhone("85996487923")).toBe(false);
    expect(isTechnicalPhone("(85) 99648-7923")).toBe(false);
    expect(isTechnicalPhone("55999998888")).toBe(false);
    expect(isTechnicalPhone(null)).toBe(false);
    expect(isTechnicalPhone(undefined)).toBe(false);
    expect(isTechnicalPhone("")).toBe(false);
  });

  it("does not flag a JID that wraps a real number", () => {
    expect(isTechnicalPhone("5511987654321@s.whatsapp.net")).toBe(false);
  });

  it("flags a technical id hidden inside a number envelope", () => {
    expect(isTechnicalPhone("186432031355045@s.whatsapp.net")).toBe(true);
    expect(isTechnicalPhone("186432031355045@c.us")).toBe(true);
  });
});

describe("formatDisplayName", () => {
  it("masks a LID in the phone column instead of rendering it as a number", () => {
    expect(formatDisplayName("Lead 186432031355045@lid", "186432031355045@lid"))
      .toBe("[WhatsApp - Lead Anônimo]");
    expect(formatDisplayName(null, "186432031355045@lid")).toBe("[WhatsApp - Lead Anônimo]");
  });

  it("still prefers a real name over a masked phone", () => {
    expect(formatDisplayName("Maria Souza", "186432031355045@lid")).toBe("Maria Souza");
  });

  it("formats a real phone the way it always did", () => {
    expect(formatDisplayName(null, "5585996487923")).toBe("+55 (85) 99648-7923");
    expect(formatDisplayName(null, "85996487923")).toBe("(85) 99648-7923");
  });

  it("falls back when there is nothing to show", () => {
    expect(formatDisplayName(null, null)).toBe("[WhatsApp - Lead Anônimo]");
    expect(formatDisplayName(null, null, "[Novo Contato - WhatsApp]"))
      .toBe("[Novo Contato - WhatsApp]");
  });
});

describe("isTechnicalId", () => {
  it("still flags the name shapes Sprint 5.5 targeted", () => {
    expect(isTechnicalId("Lead 186432031355045@lid")).toBe(true);
    expect(isTechnicalId("264162450083898@lid")).toBe(true);
    expect(isTechnicalId("186432031355045")).toBe(true);
    expect(isTechnicalId("Maria Souza")).toBe(false);
    expect(isTechnicalId("[WhatsApp - Lead Anônimo]")).toBe(false);
  });
});

describe("formatBrPhone", () => {
  it("keeps rendering BR numbers", () => {
    expect(formatBrPhone("5585996487923")).toBe("+55 (85) 99648-7923");
    expect(formatBrPhone("85996487923")).toBe("(85) 99648-7923");
    expect(formatBrPhone(null)).toBeNull();
  });
});
