// src/components/crm/copilot/SyncButton.test.tsx
//
// Sprint 6.10 / fixes1-T1 — TDD for SyncButton TDZ crash.
//
// Bug: `running` was declared at line ~90 but referenced in two useEffect
// dependency arrays at lines ~77 and ~87, causing a TDZ ReferenceError on
// every render.
//
// Test strategy: render the component with all heavy deps mocked, assert it
// renders without throwing. Before the fix this throws; after the fix it passes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock heavy external deps ──────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    equipe: { is_crm_agent_enabled: true },
    user: null,
    session: null,
    profile: null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshEquipe: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCopilotSync", () => ({
  useCopilotSync: () => ({
    events: [],
    running: false,
    error: null,
    start: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCopilotSweep", () => ({
  useCopilotSweep: () => ({
    events: [],
    running: false,
    error: null,
    start: vi.fn(),
  }),
}));

vi.mock("@/components/crm/copilot/TelemetryHUD", () => ({
  TelemetryHUD: () => null,
}));

vi.mock("@/components/crm/copilot/CopilotThinkingBadge", () => ({
  CopilotThinkingBadge: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

import { SyncButton } from "./SyncButton";

describe("SyncButton — TDZ crash (running used before declaration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders in sweep mode without throwing", () => {
    expect(() =>
      render(<SyncButton mode="sweep" pipelineId="p1" />, { wrapper }),
    ).not.toThrow();
  });

  it("renders in single mode without throwing", () => {
    expect(() =>
      render(<SyncButton mode="single" leadId="l1" />, { wrapper }),
    ).not.toThrow();
  });
});
