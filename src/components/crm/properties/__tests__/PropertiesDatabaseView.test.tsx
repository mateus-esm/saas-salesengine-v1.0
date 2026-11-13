// Sprint 15 · T8 — Imóveis na mesma grade do CRM.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));
vi.mock("@/hooks/useRelationResolver", () => ({
  useRelationResolver: () => ({ links: [], loading: false }),
}));

const hook = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/hooks/useProperties", () => ({ useProperties: () => hook.state }));
vi.mock("../AddPropertyModal", () => ({ AddPropertyModal: () => null }));
vi.mock("../PropertyDetailModal", () => ({
  PropertyDetailModal: ({ open }: { open: boolean }) => (open ? <div role="dialog">Detalhe</div> : null),
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { PropertiesDatabaseView } from "../PropertiesDatabaseView";

const properties = [
  {
    id: "p-1", equipe_id: "e-1", label: "Torre A", property_type: "site",
    address: { street: "Rua X", number: "10", city: "Fortaleza", state: "CE" },
    created_at: "2026-01-02T12:00:00Z",
  },
  { id: "p-2", equipe_id: "e-1", label: "Sala 3", property_type: "unit", address: null, created_at: "2026-01-03T12:00:00Z" },
];

function setup(over: Record<string, unknown> = {}) {
  hook.state = { properties, isLoading: false, error: null, refetch: vi.fn(), ...over };
  return render(
    <MemoryRouter initialEntries={["/crm?tab=properties"]}>
      <TooltipProvider>
        <PropertiesDatabaseView />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("PropertiesDatabaseView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the shared grid and opens the property from its name", () => {
    setup();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers).toContain("Nome");
    expect(screen.getByText("2 registros")).toBeTruthy();
    fireEvent.click(screen.getByText("Torre A"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the error block with retry when there are no rows", () => {
    const refetch = vi.fn();
    setup({ properties: [], error: new Error("x"), refetch });
    fireEvent.click(screen.getByText("Tentar de novo"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state", () => {
    setup({ properties: [] });
    expect(screen.getByText(/nenhum registro/i)).toBeTruthy();
  });
});
