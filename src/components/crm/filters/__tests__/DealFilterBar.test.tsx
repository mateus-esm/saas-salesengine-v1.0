// Sprint 11 · Onda 2 · T17 — the deal filter bar builds the right filter object.
process.env.TZ = "America/Sao_Paulo";

import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({
    members: [{ id: "11111111-1111-4111-8111-111111111111", name: "Luiz", email: "l@x.test" }],
    nameOf: (id: string) => (id === "11111111-1111-4111-8111-111111111111" ? "Luiz" : null),
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { DealFilterBar } from "../DealFilterBar";
import { dealFilterChips, matchPreset, presetRange, removeDealChip } from "../model";
import type { CrmFilters } from "@/types/crmFilters";
import type { CustomFieldSchema } from "@/types/pipelines";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const STAGES = [
  { id: "22222222-2222-4222-8222-222222222222", name: "Proposta" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Entrada" },
];
const FONTE: CustomFieldSchema = {
  field_id: "44444444-4444-4444-8444-444444444444",
  key: "fonte",
  label: "Fonte",
  type: "select",
  required: false,
  position: 0,
  options: ["Site", "Indicação"],
};

describe("chip model", () => {
  const ctx = { stages: STAGES, fields: [FONTE], nameOf: () => null };

  it("labels each active filter and removes only the one asked", () => {
    const f: CrmFilters = {
      stage_ids: [STAGES[0].id],
      statuses: ["open"],
      value_min: 1000,
      custom: [{ field_id: FONTE.field_id, op: "any_of", values: ["Site"] }],
    };
    expect(dealFilterChips(f, ctx).map((c) => c.label)).toEqual([
      "Etapa: Proposta",
      "Status: Aberto",
      "Valor: ≥ R$ 1.000",
      "Fonte: Site",
    ]);
    expect(removeDealChip(f, "status")).toEqual({
      stage_ids: [STAGES[0].id],
      value_min: 1000,
      custom: [{ field_id: FONTE.field_id, op: "any_of", values: ["Site"] }],
    });
    expect(removeDealChip(f, `cf:${FONTE.field_id}`).custom).toBeUndefined();
  });

  it("recognises a preset range", () => {
    const now = new Date(2026, 8, 11, 15, 0);
    const r = presetRange("last_month", now);
    expect(r).toEqual({ from: new Date(2026, 7, 1).toISOString(), to: new Date(2026, 8, 1).toISOString() });
    expect(matchPreset(r.from, r.to, now)).toBe("last_month");
    expect(matchPreset(r.from, undefined, now)).toBeNull();
  });
});

describe("DealFilterBar", () => {
  const renderBar = (filters: CrmFilters) => {
    const onChange = vi.fn();
    render(<DealFilterBar filters={filters} onChange={onChange} stages={STAGES} fields={[FONTE]} resultLabel="12 encontrados" />);
    return onChange;
  };

  it("removing a chip removes that filter and keeps the others", () => {
    const onChange = renderBar({ stage_ids: [STAGES[0].id], statuses: ["open"] });
    fireEvent.click(screen.getByRole("button", { name: "Remover filtro Etapa: Proposta" }));
    expect(onChange).toHaveBeenCalledWith({ statuses: ["open"] });
  });

  it("offers 'Sem responsável' and sends owner_ids: ['none']", async () => {
    const onChange = renderBar({});
    fireEvent.keyDown(screen.getByRole("button", { name: /Responsável/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Sem responsável" }));
    expect(onChange).toHaveBeenCalledWith({ owner_ids: ["none"] });
  });

  it("adds a filter on a declared field with the operators of its type", async () => {
    const onChange = renderBar({});
    fireEvent.click(screen.getByRole("button", { name: "Filtro" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fonte" }));
    // A select offers "is any of", "is empty", "is filled".
    const cond = screen.getByRole("combobox", { name: "Condição" }) as HTMLSelectElement;
    expect(Array.from(cond.options).map((o) => o.value)).toEqual(["any_of", "empty", "not_empty"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Indicação" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onChange).toHaveBeenCalledWith({
      custom: [{ field_id: FONTE.field_id, op: "any_of", values: ["Indicação"] }],
    });
  });

  it("'Limpar' clears everything; the result label is shown", () => {
    const onChange = renderBar({ search: "maria", statuses: ["won"] });
    expect(screen.getByText("12 encontrados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
