import { describe, expect, it } from "vitest";

import { breadcrumbFor } from "../useNavGroups";

describe("breadcrumbFor", () => {
  it("uses the route label for routes outside the menu", () => {
    expect(breadcrumbFor([], { pathname: "/pipeline", search: "" })).toEqual(["Pipeline"]);
    expect(breadcrumbFor([], { pathname: "/notificacoes", search: "" })).toEqual(["Notificações"]);
  });

  it("stays empty for an unknown route", () => {
    expect(breadcrumbFor([], { pathname: "/nada", search: "" })).toEqual([]);
  });
});
