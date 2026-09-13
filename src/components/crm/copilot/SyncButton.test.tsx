// src/components/crm/copilot/SyncButton.test.tsx
//
// Sprint 6.10 / fixes1-T1 — the button renders in both modes.
// Sprint 11 · Onda 6 · T61 — it only queues: the click calls crm_copilot_enqueue
// with the deal (or the pipeline), never the agent; off when the team's Agente
// de CRM is off.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  agentEnabled: true,
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const { rpc, toast } = mocks;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ equipe: { is_crm_agent_enabled: mocks.agentEnabled }, user: null, session: null, profile: null, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

import { SyncButton } from "./SyncButton";

describe("SyncButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentEnabled = true;
    rpc.mockResolvedValue({ data: { queued: 1, job_ids: ["j1"] }, error: null });
  });

  it("renders in both modes without throwing", () => {
    expect(() => render(<SyncButton mode="sweep" pipelineId="p1" />, { wrapper })).not.toThrow();
    expect(() => render(<SyncButton mode="single" leadId="l1" />, { wrapper })).not.toThrow();
  });

  it("the card queues its deal — the deal wins over the contact", async () => {
    const { getByLabelText } = render(<SyncButton mode="single" leadId="l1" opportunityId="o1" pipelineId="p1" />, { wrapper });
    fireEvent.click(getByLabelText("Sincronizar com o Copilot"));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("crm_copilot_enqueue", {
        p_opportunity_id: "o1", p_lead_id: null, p_stage_id: null, p_pipeline_id: null,
      }),
    );
  });

  it("the header queues the pipeline; nothing new says so", async () => {
    rpc.mockResolvedValue({ data: { queued: 0, job_ids: [] }, error: null });
    const { getByLabelText } = render(<SyncButton mode="sweep" variant="header" pipelineId="p1" />, { wrapper });
    fireEvent.click(getByLabelText("Sincronizar com o Copilot"));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("crm_copilot_enqueue", {
        p_opportunity_id: null, p_lead_id: null, p_stage_id: null, p_pipeline_id: "p1",
      }),
    );
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Nenhum negócio com conversa nova para ler."));
  });

  it("off when the team's Agente de CRM is off", () => {
    mocks.agentEnabled = false;
    const { getByLabelText } = render(<SyncButton mode="single" leadId="l1" />, { wrapper });
    expect((getByLabelText("Sincronizar com o Copilot") as HTMLButtonElement).disabled).toBe(true);
  });
});
