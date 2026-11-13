// Sprint 15 · T7 — the grid has a fixed structure: one header for every state,
// fixed column widths, a sticky header and first column, and a row count.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
    expect(classes(table)).toEqual(expect.arrayContaining(["table-fixed", "min-w-full"]));
    const cols = table.querySelectorAll("colgroup > col");
    // checkbox + 3 columns + add column + filler
    expect(cols).toHaveLength(columns.length + 3);
    expect((cols[1] as HTMLElement).style.width).toBe("260px");
    expect((cols[2] as HTMLElement).style.width).toBe("180px");
    expect((cols[3] as HTMLElement).style.width).toBe("220px");
    // The filler has no width: it takes what is left up to the right edge.
    expect((cols[cols.length - 1] as HTMLElement).style.width).toBe("");
  });

  // Sprint 15 · T9 — every real screen passes a surfaceKey (saved layout); the
  // layout used to give every column without a width 150px, over these.
  it("with a saved layout, columns keep the grid's default widths", () => {
    localStorage.clear();
    const { container } = renderGrid({ surfaceKey: "t9_widths" });
    const cols = container.querySelectorAll("colgroup > col");
    expect((cols[1] as HTMLElement).style.width).toBe("260px");
    expect((cols[2] as HTMLElement).style.width).toBe("180px");
    expect((cols[3] as HTMLElement).style.width).toBe("220px");
  });

  it("colgroup counts the score column too", () => {
    const { container } = renderGrid({ showLeadScore: true });
    // checkbox + score + 3 columns + filler
    expect(container.querySelectorAll("colgroup > col")).toHaveLength(columns.length + 3);
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

  it("the score column sorts but has no resize handle (fixed width)", () => {
    renderGrid({ showLeadScore: true, onSort: vi.fn(), onResizeColumn: vi.fn() });
    const score = screen.getAllByRole("columnheader").find((h) => h.textContent?.startsWith("Score"))!;
    expect(score.querySelector(".cursor-col-resize")).toBeNull();
    const phone = screen.getAllByRole("columnheader").find((h) => h.textContent?.includes("Telefone"))!;
    expect(phone.querySelector(".cursor-col-resize")).not.toBeNull();
  });

  it("the observer attaches again when the sentinel comes back after a reload", () => {
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    const props = { rows, columns, onCellCommit: vi.fn(async () => {}), massActions: [], hasMore: true };
    const { rerender } = render(
      <TooltipProvider>
        <SpreadsheetGrid {...props} />
      </TooltipProvider>,
    );
    const first = observe.mock.calls.length;
    // A reload: loading on, then the same rows (same length) back.
    rerender(
      <TooltipProvider>
        <SpreadsheetGrid {...props} loading />
      </TooltipProvider>,
    );
    rerender(
      <TooltipProvider>
        <SpreadsheetGrid {...props} />
      </TooltipProvider>,
    );
    expect(observe.mock.calls.length).toBeGreaterThan(first);
    const lastTarget = observe.mock.calls[observe.mock.calls.length - 1][0] as Element;
    expect(lastTarget.isConnected).toBe(true);
    vi.unstubAllGlobals();
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

  // Sprint 15 · T9 — a selection is of rows on screen. After a filter or a search
  // swaps the rows, rows that left must not stay selected (a mass "Excluir"
  // would act on rows the user no longer sees).
  it("rows that leave the grid leave the selection", async () => {
    const run = vi.fn(async () => {});
    const massActions = [{ id: "del", label: "Excluir", icon: null, run }];
    const props = { columns, onCellCommit: vi.fn(async () => {}), massActions };
    const { rerender } = render(
      <TooltipProvider>
        <SpreadsheetGrid {...props} rows={rows} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar linha r-1" }));
    expect(screen.getByText("1 selecionado")).toBeTruthy();

    rerender(
      <TooltipProvider>
        <SpreadsheetGrid {...props} rows={[rows[1], rows[2]]} />
      </TooltipProvider>,
    );
    expect(screen.queryByText(/selecionado/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Selecionar todos" }).getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.getByText("2 selecionados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Excluir/ }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(["r-2", "r-3"]));
  });

  describe("paging", () => {
    type Observed = { callback: IntersectionObserverCallback; options?: IntersectionObserverInit };
    let observed: Observed[] = [];

    beforeEach(() => {
      observed = [];
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            observed.push({ callback, options });
          }
          observe() {}
          unobserve() {}
          disconnect() {}
          takeRecords() {
            return [];
          }
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const fire = (o: Observed) =>
      o.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    it("a grid that scrolls observes the sentinel inside itself and pages on scroll", () => {
      // The grid's height is bounded: its content is taller than its box.
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(2000);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
      const onEndReached = vi.fn();
      const { container } = renderGrid({ hasMore: true, onEndReached });
      const root = container.firstElementChild;
      const last = observed[observed.length - 1];
      expect(last.options?.root).toBe(root);
      expect(last.options?.rootMargin).toBe("400px");
      fire(last);
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it("a grid that grows with its rows observes against the viewport", () => {
      const onEndReached = vi.fn();
      renderGrid({ hasMore: true, onEndReached });
      const last = observed[observed.length - 1];
      expect(last.options?.root ?? null).toBeNull();
      fire(last);
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it("no more pages, no observer", () => {
      renderGrid({ hasMore: false });
      expect(observed).toHaveLength(0);
    });
  });
});
