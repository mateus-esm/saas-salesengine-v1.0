import { describe, expect, it } from "vitest";
import { withNameLock } from "../leadNameLock";

describe("withNameLock", () => {
  it("trava o nome quando a edição troca o nome", () => {
    expect(withNameLock({ name: "Maria Souza", email: "m@x.com" })).toEqual({
      name: "Maria Souza",
      email: "m@x.com",
      name_locked: true,
    });
  });

  it("não trava quando a edição não toca o nome", () => {
    expect(withNameLock({ email: "m@x.com" })).toEqual({ email: "m@x.com" });
    expect("name_locked" in withNameLock({ observations: "x" })).toBe(false);
  });

  it("nome em branco não trava", () => {
    expect("name_locked" in withNameLock({ name: "  " })).toBe(false);
  });
});
