// Sprint 15 · T8 — Empresas na mesma grade do CRM.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: () => ({ links: [], loading: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { equipe_id: "e-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const hook = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/useCompanies", () => ({ useCompanies: () => hook.state }));
vi.mock("../AddCompanyModal", () => ({ AddCompanyModal: () => null }));
vi.mock("../CompanyDetailModal", () => ({
  CompanyDetailModal: ({ open }: { open: boolean }) => (open ? <div role="dialog">Detalhe</div> : null),
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { CompaniesDatabaseView } from "../CompaniesDatabaseView";

const companies = [
  { id: "c-1", equipe_id: "e-1", name: "Acme", industry: "Varejo", cnpj: null, size_bracket: null, website: null },
  { id: "c-2", equipe_id: "e-1", name: "Beta", industry: null, cnpj: "123", size_bracket: "11-50", website: "beta.test" },
];

function setup(over: Record<string, unknown> = {}) {
  hook.state = { companies, isLoading: false, error: null, refetch: vi.fn(), ...over };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/crm?tab=companies"]}>
        <TooltipProvider>
          <CompaniesDatabaseView />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CompaniesDatabaseView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the shared grid and opens the company from its name", () => {
    setup();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers).toContain("Nome");
    expect(screen.getByText("2 registros")).toBeTruthy();
    fireEvent.click(screen.getByText("Acme"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the error block with retry when there are no rows", () => {
    const refetch = vi.fn();
    setup({ companies: [], error: new Error("x"), refetch });
    fireEvent.click(screen.getByText("Tentar de novo"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state", () => {
    setup({ companies: [] });
    expect(screen.getByText(/nenhum registro/i)).toBeTruthy();
  });
});
