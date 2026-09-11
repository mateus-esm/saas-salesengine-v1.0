// Sprint 11 · Onda 2 · T15 — the grid cell edits each field type the right way.
process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it, vi, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({
    members: [{ id: "u-1", name: "Luiz", email: "luiz@x.test" }],
    nameOf: (id: string | null | undefined) => (id === "u-1" ? "Luiz" : null),
    isLoading: false,
  }),
}));

const resolverSpy = vi.fn(() => ({ links: [], loading: false }));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: (...args: unknown[]) => resolverSpy(...args),
}));

import { InlineCell } from "../InlineCell";
import type { ColumnDef, GridRow } from "../types";

beforeAll(() => {
  // Radix popovers measure themselves; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const row: GridRow = { id: "row-1", equipe_id: "e-1" };

const col = (over: Partial<ColumnDef>): ColumnDef => ({
  key: "f-1",
  label: "Campo",
  kind: "text",
  source: "jsonb",
  jsonbField: "custom_data",
  ...over,
});

function renderCell(column: ColumnDef, value: unknown, onCommit = vi.fn(async () => {}), onOpen?: () => void) {
  render(<InlineCell row={row} column={column} value={value} onCommit={onCommit} onOpen={onOpen} />);
  return onCommit;
}

describe("InlineCell", () => {
  it("a Select column offers the field's options and saves the chosen one", () => {
    const column = col({
      kind: "select",
      label: "Fonte",
      options: [
        { value: "Site", label: "Site" },
        { value: "Indicação", label: "Indicação" },
      ],
    });
    const onCommit = renderCell(column, "Indicação");
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));

    const select = screen.getByRole("combobox", { name: "Fonte" });
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      "— vazio —",
      "Site",
      "Indicação",
    ]);
    fireEvent.change(select, { target: { value: "Site" } });
    expect(onCommit).toHaveBeenCalledWith("Site");
  });

  it("a multi-select saves a list, never a string", async () => {
    const column = col({
      kind: "multi_select",
      label: "Produtos",
      options: [
        { value: "Bateria", label: "Bateria" },
        { value: "Módulo", label: "Módulo" },
      ],
    });
    const onCommit = renderCell(column, ["Módulo"]);
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));

    fireEvent.click(await screen.findByRole("checkbox", { name: "Bateria" }));
    fireEvent.click(screen.getByRole("button", { name: "Pronto" }));
    expect(onCommit).toHaveBeenCalledWith(["Módulo", "Bateria"]);
  });

  it("a date typed in the grid is stored as local midnight (it used to land one day early)", () => {
    const onCommit = renderCell(col({ kind: "date", label: "Visita" }), null);
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));

    const input = screen.getByLabelText("Visita");
    fireEvent.change(input, { target: { value: "2026-03-14" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(new Date(2026, 2, 14).toISOString());
  });

  it("yes/no toggles to a boolean", () => {
    const onCommit = renderCell(col({ kind: "boolean", label: "Bateria" }), false);
    expect(screen.getByTestId("cell-f-1").textContent).toBe("Não");
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));
    fireEvent.change(screen.getByRole("combobox", { name: "Bateria" }), { target: { value: "true" } });
    expect(onCommit).toHaveBeenCalledWith(true);
  });

  it("currency accepts the Brazilian way of typing", () => {
    const onCommit = renderCell(col({ kind: "currency", label: "Ticket" }), 1500);
    expect(screen.getByTestId("cell-f-1").textContent).toBe("R$ 1.500,00");
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));
    const input = screen.getByLabelText("Ticket");
    fireEvent.change(input, { target: { value: "1.234,56" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(1234.56);
  });

  it("a failed save shows on the cell and the value stays what it was", async () => {
    const onCommit = vi.fn(async () => {
      throw new Error("sem permissão");
    });
    renderCell(col({ kind: "text", label: "Obs" }), "antes", onCommit);
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));
    const input = screen.getByLabelText("Obs");
    fireEvent.change(input, { target: { value: "depois" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("img", { name: "sem permissão" })).toBeTruthy();
    expect(screen.getByTestId("cell-f-1").textContent).toContain("antes");
  });

  it("an unchanged value does not call the server", () => {
    const onCommit = renderCell(col({ kind: "text", label: "Obs" }), "igual");
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));
    fireEvent.keyDown(screen.getByLabelText("Obs"), { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a user field shows the member's name", () => {
    renderCell(col({ kind: "user", label: "Pré-vendedor", context: { nameOf: (id) => (id === "u-1" ? "Luiz" : null) } }), "u-1");
    expect(screen.getByTestId("cell-f-1").textContent).toContain("Luiz");
  });

  it("the primary column opens the record instead of editing", () => {
    const onOpen = vi.fn();
    renderCell(col({ kind: "text", key: "lead_name", label: "Lead", primary: true }), "Maria", vi.fn(), onOpen);
    fireEvent.click(screen.getByRole("button", { name: "Maria" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("address is read-only in the grid", () => {
    renderCell(col({ kind: "address", label: "Endereço", editable: false }), { street: "Rua A", city: "Fortaleza" });
    fireEvent.doubleClick(screen.getByTestId("cell-f-1"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a relation whose chips come in the row does not query", async () => {
    resolverSpy.mockClear();
    render(
      <InlineCell
        row={row}
        column={col({ kind: "relation", key: "company", relation: { table: "companies", displayField: "name", resolvedFromRow: true } })}
        value={[{ id: "c-1", name: "Empresa X" }]}
        onCommit={vi.fn()}
        equipeId="e-1"
        fromTable="opportunities"
      />,
    );
    expect(screen.getByText("Empresa X")).toBeTruthy();
    await waitFor(() => expect(resolverSpy).toHaveBeenCalled());
    // Called with an empty context, which keeps its query disabled.
    expect(resolverSpy.mock.calls[0][2]).toEqual({ fromTable: "", equipeId: "" });
  });
});
