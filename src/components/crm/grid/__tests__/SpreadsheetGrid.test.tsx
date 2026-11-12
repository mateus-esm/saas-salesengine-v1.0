// Sprint 15 · T7 — the grid has a fixed structure: one header for every state,
// fixed column widths, a sticky header and first column, and a row count.

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: () => ({ links: [], loading: false }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { SpreadsheetGrid, type SpreadsheetGridProps } from "../SpreadsheetGrid";
import type { ColumnDef, GridRow } from "../types";

const columns: ColumnDef[] = [
  { key: "name", label: "Nome", kind: "text", source: "native", primary: true },
  { key: "phone", label: "Telefone", kind: "phone", source: "native" },
  { key: "email", label: "E-mail", kind: "text", source: "native", width: 220 },
];

const rows: GridRow[] = [
  { id: "r-1", equipe_id: "e-1", name: "Ana", phone: "5585999990001", email: "ana@x.test" },
  { id: "r-2", equipe_id: "e-1", name: "Bruno", phone: "5585999990002", email: "bruno@x.test" },
  { id: "r-3", equipe_id: "e-1", name: "Carla", phone: "5585999990003", email: "carla@x.test" },
];

function renderGrid(over: Partial<SpreadsheetGridProps> = {}) {
  return render(
    <TooltipProvider>
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onCellCommit={vi.fn(async () => {})}
      massActions={[]}
      {...over}
    />
    </TooltipProvider>,
  );
}

const classes = (el: Element) => [...el.classList];

const headerLabels = () => screen.getAllByRole("columnheader").map((th) => th.textContent?.trim() ?? "");

describe("SpreadsheetGrid", () => {
  it("grid root is the scroll container", () => {
    const { container } = renderGrid();
    const root = container.firstElementChild as HTMLElement;
    expect(classes(root)).toEqual(expect.arrayContaining(["h-full", "min-h-0", "overflow-auto"]));
  });

  it("table uses fixed layout with a colgroup", () => {
    const { container } = renderGrid({ onAddColumn: vi.fn() });
    const table = container.querySelector("table")!;
    expect(classes(table)).toEqual(expect.arrayContaining(["table-fixed"]));
    const cols = table.querySelectorAll("colgroup > col");
    // checkbox + 3 columns + add column
    expect(cols).toHaveLength(columns.length + 2);
    expect((cols[1] as HTMLElement).style.width).toBe("260px");
    expect((cols[2] as HTMLElement).style.width).toBe("180px");
    expect((cols[3] as HTMLElement).style.width).toBe("220px");
  });

  it("colgroup counts the score column too", () => {
    const { container } = renderGrid({ showLeadScore: true });
    expect(container.querySelectorAll("colgroup > col")).toHaveLength(columns.length + 2);
  });

  it("checkbox and primary cells are sticky", () => {
    renderGrid();
    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    expect(classes(cells[0])).toEqual(expect.arrayContaining(["sticky", "left-0"]));
    expect(classes(cells[1])).toEqual(expect.arrayContaining(["sticky", "left-10"]));
    expect(classes(cells[2])).not.toContain("sticky");
  });

  it("with the score column the primary sticks after it", () => {
    renderGrid({ showLeadScore: true });
    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    expect(classes(cells[1])).toEqual(expect.arrayContaining(["sticky"]));
    expect(cells[1].style.left).toBe("40px");
    expect(classes(cells[2])).toEqual(expect.arrayContaining(["sticky"]));
    expect(cells[2].style.left).toBe("104px");
  });

  it("the primary does not stick when it is not the first column", () => {
    renderGrid({ columns: [columns[1], columns[0], columns[2]] });
    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    expect(classes(cells[0])).toEqual(expect.arrayContaining(["sticky"]));
    expect(classes(cells[1])).not.toContain("sticky");
    expect(classes(cells[2])).not.toContain("sticky");
  });

  it("header shows type icon and sentence-case label", () => {
    renderGrid();
    const th = screen.getAllByRole("columnheader").find((h) => h.textContent?.includes("Telefone"))!;
    expect(th.querySelector("svg")).not.toBeNull();
    expect(classes(th)).not.toContain("uppercase");
  });

  it("footer counts rows", () => {
    const { unmount } = renderGrid({ hasMore: true });
    expect(screen.getByText("3+ registros")).toBeTruthy();
    unmount();
    renderGrid();
    expect(screen.getByText("3 registros")).toBeTruthy();
  });

  it("footer is singular for one row and zero when empty", () => {
    const { unmount } = renderGrid({ rows: [rows[0]] });
    expect(screen.getByText("1 registro")).toBeTruthy();
    unmount();
    renderGrid({ rows: [] });
    expect(screen.getByText("0 registros")).toBeTruthy();
    expect(screen.getByText("Nenhum registro encontrado.")).toBeTruthy();
  });

  it("footer shows no count while loading", () => {
    renderGrid({ loading: true });
    expect(screen.queryByText(/registros?$/)).toBeNull();
  });

  it("one header in all states", () => {
    const { unmount: u1 } = renderGrid({ loading: true });
    const loading = headerLabels();
    u1();
    const { unmount: u2 } = renderGrid({ rows: [] });
    const empty = headerLabels();
    u2();
    renderGrid();
    const data = headerLabels();
    expect(loading).toEqual(data);
    expect(empty).toEqual(data);
    expect(data).toEqual(expect.arrayContaining(["Nome", "Telefone", "E-mail"]));
  });
});
