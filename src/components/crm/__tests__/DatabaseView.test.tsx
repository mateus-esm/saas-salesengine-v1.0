// Sprint 15 · T9 — the contact base (Contatos) on the shared grid.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ContactRow } from "@/types/crmTables";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({
    members: [{ id: "u-1", name: "Luiz", email: "luiz@x.test" }],
    nameOf: (id: string | null | undefined) => (id === "u-1" ? "Luiz" : null),
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: () => ({ links: [], loading: false }),
}));
vi.mock("@/hooks/usePipelines", () => ({ usePipelines: () => ({ activePipelines: [] }) }));
vi.mock("@/hooks/useContactFields", () => ({
  useContactFields: () => ({
    fields: [
      { field_id: "f-sdr", key: "sdr", label: "Pré-vendedor", type: "user", required: false, position: 1 },
    ],
    isLoading: false,
    createField: { mutate: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/hooks/useUrlFilters", () => ({
  useContactUrlFilters: () => ({ filters: {}, setFilters: vi.fn(), sort: null, setSort: vi.fn() }),
}));
vi.mock("@/hooks/useLead", () => ({ useLead: () => ({ data: null }) }));
vi.mock("@/hooks/useLeads", () => ({
  useLeadMutations: () => ({ updateLead: { mutate: vi.fn() }, deleteLead: { mutate: vi.fn() } }),
}));

const contact: ContactRow = {
  id: "c-1",
  equipe_id: "e-1",
  name: "Maria",
  phone: "5585999990001",
  email: null,
  origin_category: null,
  channel: null,
  tags: [],
  observations: null,
  created_at: "2026-01-01T12:00:00Z",
  last_message_at: null,
  next_contact: null,
  personal_custom_data: { sdr: "u-1" },
  company_name: null,
  property_count: 0,
  relationship: "sem_negocio",
  open_count: 0,
  won_value: 0,
  last_won_at: null,
  deals: [],
};

let tableState = { isError: false, rows: [contact] as unknown[] };
const refetchTable = vi.fn();
const fetchNextPageSpy = vi.fn();
vi.mock("@/hooks/useContactsTable", () => ({
  useContactsTable: () => ({
    data: { pages: [tableState.rows], pageParams: [0] },
    isLoading: false,
    isError: tableState.isError,
    hasNextPage: true,
    isFetchingNextPage: false,
    refetch: refetchTable,
    fetchNextPage: fetchNextPageSpy,
  }),
  useContactsCount: () => ({ data: 1, isLoading: false }),
  useContactsRealtime: () => {},
  useDeleteContacts: () => ({ mutate: vi.fn() }),
  useContactCellUpdate: () => vi.fn(async () => {}),
  fetchAllContacts: vi.fn(),
}));

// The modals and the filter bar are not under test here.
vi.mock("../AddContactModal", () => ({ AddContactModal: () => null }));
vi.mock("../ImportModal", () => ({ ImportModal: () => null }));
vi.mock("../ExportModal", () => ({ ExportModal: () => null }));
vi.mock("../ContactDetailsModal", () => ({ ContactDetailsModal: () => null }));
vi.mock("../AssignToPipelineDialog", () => ({ AssignToPipelineDialog: () => null }));
vi.mock("../filters/ContactFilterBar", () => ({ ContactFilterBar: () => null }));

import { DatabaseView } from "../DatabaseView";

describe("DatabaseView", () => {
  it("a contact field of type Usuário shows the member's name", () => {
    localStorage.clear();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <DatabaseView />
        </TooltipProvider>
      </MemoryRouter>,
    );
    const cell = screen.getByTestId("cell-sdr");
    expect(cell.textContent).toContain("Luiz");
    expect(cell.textContent).not.toContain("Usuário removido");
  });

  function renderView() {
    localStorage.clear();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <DatabaseView />
        </TooltipProvider>
      </MemoryRouter>,
    );
  }

  it("a failed refetch with rows keeps the grid and shows a notice", () => {
    tableState = { isError: true, rows: [contact] };
    fetchNextPageSpy.mockClear();
    renderView();
    expect(screen.getByTestId("cell-sdr")).toBeTruthy();
    expect(screen.getByText("Não foi possível carregar mais registros.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    // Another page is pending, so the retry asks for it.
    expect(fetchNextPageSpy).toHaveBeenCalledTimes(1);
    tableState = { isError: false, rows: [contact] };
  });


  // Every observed sentinel reports itself visible at once.
  function stubVisibleSentinel() {
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
  }

  it("a failed page does not retry by itself when the sentinel is visible", () => {
    stubVisibleSentinel();
    tableState = { isError: true, rows: [contact] };
    fetchNextPageSpy.mockClear();
    renderView();
    expect(fetchNextPageSpy).not.toHaveBeenCalled();
    tableState = { isError: false, rows: [contact] };
    vi.unstubAllGlobals();
  });

  it("a failed load without rows shows the error block", () => {
    tableState = { isError: true, rows: [] };
    renderView();
    expect(screen.getByText("Não foi possível carregar os contatos.")).toBeTruthy();
    expect(screen.queryByText("Não foi possível carregar mais registros.")).toBeNull();
    tableState = { isError: false, rows: [contact] };
  });
});
