import { describe, it, expect } from "vitest";
import { toDisplayMode, toDbMode, DISPLAY_OPTIONS } from "../copilot";

describe("toDisplayMode", () => {
  it("maps 'observe' to 'copilot'", () => {
    expect(toDisplayMode("observe")).toBe("copilot");
  });
  it("maps 'suggest' to 'copilot'", () => {
    expect(toDisplayMode("suggest")).toBe("copilot");
  });
  it("maps 'autonomous' to 'autopilot'", () => {
    expect(toDisplayMode("autonomous")).toBe("autopilot");
  });
});

describe("toDbMode", () => {
  it("maps 'copilot' to 'suggest'", () => {
    expect(toDbMode("copilot")).toBe("suggest");
  });
  it("maps 'autopilot' to 'autonomous'", () => {
    expect(toDbMode("autopilot")).toBe("autonomous");
  });
});

describe("DISPLAY_OPTIONS", () => {
  it("has exactly 2 options", () => {
    expect(DISPLAY_OPTIONS).toHaveLength(2);
  });
  it("has copilot and autopilot", () => {
    const values = DISPLAY_OPTIONS.map((o) => o.value);
    expect(values).toContain("copilot");
    expect(values).toContain("autopilot");
  });
});
