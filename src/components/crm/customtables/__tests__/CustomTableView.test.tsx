// Sprint 15 · T7 — a custom table whose records fail to load says so, with a
// retry; it does not pretend the table is empty.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CustomTable } from "@/hooks/useCustomTables";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { equipe_id: "e-1" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: () => ({ links: [], loading: false }),
}));
vi.mock("@/hooks/useArtifactStatus", () => ({
  useSetArtifactStatus: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useCustomTables", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useCustomTables")>()),
  useCustomTables: () => ({ tables: [], updateTable: { mutateAsync: vi.fn(), isPending: false } }),
}));

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const refetch = vi.fn();
const loadMore = vi.fn();
let recordsState: { error: Error | null; isLoading: boolean; records?: unknown[] } = { error: null, isLoading: false };
vi.mock("@/hooks/useCustomTableRecords", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useCustomTableRecords")>()),
  useCustomTableRecords: () => ({
    records: recordsState.records ?? [],
    total: null,
    isLoading: recordsState.isLoading,
    error: recordsState.error,
    refetch,
    hasMore: (recordsState.records?.length ?? 0) > 0,
    loadingMore: false,
    loadMore,
    createRecord: mutation,
    updateRecord: mutation,
    deleteRecords: mutation,
  }),
  useCustomTableRelations: () => ({}),
}));

import { CustomTableView } from "../CustomTableView";

const table: CustomTable = {
  id: "t-1",
  equipe_id: "e-1",
  name: "Propostas",
  slug: "propostas",
  icon: null,
  description: null,
  table_schema: [],
  artifact_kind: null,
  actions: [],
  form_config: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderView() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TooltipProvider>
          <CustomTableView table={table} onBack={vi.fn()} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CustomTableView", () => {
  it("a failed load shows the error and a retry, not an empty table", () => {
    recordsState = { error: new Error("boom"), isLoading: false };
    refetch.mockClear();
    renderView();
    expect(screen.getByText("Não foi possível carregar os registros.")).toBeTruthy();
    expect(screen.queryByText("0 registros")).toBeNull();
    expect(screen.queryByText("Nenhum registro encontrado.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a failed load-more keeps the rows and offers a retry", () => {
    recordsState = {
      error: new Error("boom"),
      isLoading: false,
      records: [
        { id: "r-1", table_id: "t-1", equipe_id: "e-1", data: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ],
    };
    refetch.mockClear();
    renderView();
    expect(screen.getByText("Não foi possível carregar mais registros.")).toBeTruthy();
    expect(screen.queryByText("Não foi possível carregar os registros.")).toBeNull();
    expect(screen.getAllByText("1 registro").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a failed page does not retry by itself when the sentinel is visible", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: true }]);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    recordsState = {
      error: new Error("boom"),
      isLoading: false,
      records: [
        { id: "r-1", table_id: "t-1", equipe_id: "e-1", data: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ],
    };
    loadMore.mockClear();
    renderView();
    expect(loadMore).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("without an error an empty table says so", () => {
    recordsState = { error: null, isLoading: false };
    renderView();
    expect(screen.queryByText("Não foi possível carregar os registros.")).toBeNull();
    // The header count and the grid's footer.
    expect(screen.getAllByText("0 registros")).toHaveLength(2);
  });
});
