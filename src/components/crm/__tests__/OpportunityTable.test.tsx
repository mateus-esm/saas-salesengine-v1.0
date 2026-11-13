// Sprint 15 · final — a failed refetch/load-more keeps the deals on screen.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { equipe_id: "e-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: () => ({ links: [], loading: false }),
}));
vi.mock("@/hooks/usePipelines", () => ({
  usePipelines: () => ({ pipelines: [{ id: "p-1", name: "Vendas", custom_fields_schema: [] }] }),
}));
vi.mock("@/hooks/usePipelineStagesV2", () => ({ usePipelineStagesV2: () => ({ stages: [] }) }));
vi.mock("@/hooks/useBoard", () => ({ useBoardSummary: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useLead", () => ({
  useLead: () => ({ data: null }),
  useOpportunity: () => ({ data: null }),
}));
vi.mock("@/hooks/useLeads", () => ({
  useLeadMutations: () => ({ updateLead: { mutateAsync: vi.fn() }, deleteLead: { mutateAsync: vi.fn() } }),
}));
vi.mock("@/hooks/useMoveToStage", () => ({
  useMoveToStage: () => ({ requestMove: vi.fn(), lossDialog: null }),
}));
vi.mock("@/hooks/useUrlFilters", () => ({
  useDealUrlFilters: () => ({ filters: {}, setFilters: vi.fn(), sort: null, setSort: vi.fn() }),
}));

const refetch = vi.fn();
const fetchNextPage = vi.fn();
let tableState: { isError: boolean; rows: unknown[] } = { isError: false, rows: [] };
const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/hooks/useOppTable", () => ({
  useOppTable: () => ({
    data: { pages: [tableState.rows], pageParams: [0] },
    isLoading: false,
    isError: tableState.isError,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch,
    fetchNextPage,
  }),
  useOppTableRealtime: () => {},
  useOppTablePatcher: () => vi.fn(),
  useOppCellUpdate: () => vi.fn(async () => {}),
  useUpdateOpportunities: () => mutation,
  useDeleteOpportunities: () => mutation,
}));

vi.mock("../ContactDetailsModal", () => ({ ContactDetailsModal: () => null }));
vi.mock("../OpportunityDetailModal", () => ({ OpportunityDetailModal: () => null }));
vi.mock("../filters/DealFilterBar", () => ({ DealFilterBar: () => null }));

import { OpportunityTable } from "../OpportunityTable";

const deal = {
  id: "o-1",
  equipe_id: "e-1",
  stage_id: "s-1",
  owner_id: null,
  value: 100,
  status: "open",
  companies: [],
  property_count: 0,
  touchpoint_count: 0,
  stage_entered_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  lead_score: null,
  lead: { name: "Maria Souza", phone: null, next_contact: null },
  custom_data: {},
};

function renderView() {
  localStorage.clear();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <OpportunityTable pipelineId="p-1" />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("OpportunityTable", () => {
  it("a failed refetch with rows keeps the grid and shows a notice", () => {
    tableState = { isError: true, rows: [deal] };
    refetch.mockClear();
    renderView();
    expect(screen.getAllByText("Maria Souza").length).toBeGreaterThan(0);
    expect(screen.getByText("Não foi possível carregar mais registros.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a failed load without rows shows the error block", () => {
    tableState = { isError: true, rows: [] };
    renderView();
    expect(screen.getByText("Não foi possível carregar a tabela.")).toBeTruthy();
    expect(screen.queryByText("Não foi possível carregar mais registros.")).toBeNull();
  });
});
