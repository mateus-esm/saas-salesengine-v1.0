// The app is used in Brazil: a date field must show the day the user picked,
// in São Paulo, whatever shape it was stored in.
process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it } from "vitest";

import { formatFieldDate, fromDateInputValue, parseFieldDate, toDateInputValue } from "../dateOnly";

describe("parseFieldDate", () => {
  it("reads a bare YYYY-MM-DD as a local day, not UTC midnight", () => {
    const d = parseFieldDate("2026-03-14");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(14);
  });

  it("rejects days that do not exist and garbage", () => {
    expect(parseFieldDate("2026-02-31")).toBeNull();
    expect(parseFieldDate("31/02/2026")).toBeNull();
    expect(parseFieldDate("")).toBeNull();
    expect(parseFieldDate(null)).toBeNull();
    expect(parseFieldDate({})).toBeNull();
  });
});

describe("formatFieldDate", () => {
  it("shows a bare date as that day", () => {
    expect(formatFieldDate("2026-03-14")).toBe("14/03/2026");
  });

  it("shows an ISO timestamp as the local day", () => {
    // 02:00Z on the 15th is still the 14th in São Paulo.
    expect(formatFieldDate("2026-03-15T02:00:00.000Z")).toBe("14/03/2026");
    // What the Sprint 11 repair wrote.
    expect(formatFieldDate("2026-10-09T12:00:00-03:00")).toBe("09/10/2026");
  });

  it("gives an empty string for what is not a date", () => {
    expect(formatFieldDate("abc")).toBe("");
    expect(formatFieldDate(undefined)).toBe("");
  });
});

describe("date input round trip", () => {
  it("fills the date input with the local day", () => {
    expect(toDateInputValue("2026-03-15T02:00:00.000Z")).toBe("2026-03-14");
    expect(toDateInputValue("2026-03-14")).toBe("2026-03-14");
    expect(toDateInputValue(null)).toBe("");
  });

  it("stores the picked day as local midnight — the same shape the modal writes", () => {
    const iso = fromDateInputValue("2026-03-14");
    expect(iso).toBe(new Date(2026, 2, 14).toISOString());
    expect(formatFieldDate(iso)).toBe("14/03/2026");
  });

  it("stores nothing for an empty or invalid input", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue("2026-13-40")).toBeNull();
  });
});
