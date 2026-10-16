import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { useSetResponsible, useSetAttendant } from "../useSetResponsible";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const W = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { W, spy };
}

describe("useSetResponsible / useSetAttendant (Sprint Suporte 1 · #8/#11)", () => {
  beforeEach(() => rpc.mockReset());

  it("calls crm_set_responsible with lead and user, then refreshes leads and deals", async () => {
    rpc.mockResolvedValue({ data: { opportunities_updated: 2 }, error: null });
    const { W, spy } = wrapper();
    const { result } = renderHook(() => useSetResponsible(), { wrapper: W });
    await act(async () => { await result.current.mutateAsync({ leadId: "l1", userId: "u1" }); });
    expect(rpc).toHaveBeenCalledWith("crm_set_responsible", { p_lead: "l1", p_user: "u1" });
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(["leads", "opportunities", "board"]));
  });

  it("clears the responsible with a null user", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const { W } = wrapper();
    const { result } = renderHook(() => useSetResponsible(), { wrapper: W });
    await act(async () => { await result.current.mutateAsync({ leadId: "l1", userId: null }); });
    expect(rpc).toHaveBeenCalledWith("crm_set_responsible", { p_lead: "l1", p_user: null });
  });

  it("surfaces a database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "owner_not_in_team" } });
    const { W } = wrapper();
    const { result } = renderHook(() => useSetResponsible(), { wrapper: W });
    await act(async () => { await result.current.mutateAsync({ leadId: "l1", userId: "x" }).catch(() => {}); });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("sets the attendant through crm_set_attendant and refreshes conversations", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { W, spy } = wrapper();
    const { result } = renderHook(() => useSetAttendant(), { wrapper: W });
    await act(async () => { await result.current.mutateAsync({ conversationId: "c1", userId: "u2" }); });
    expect(rpc).toHaveBeenCalledWith("crm_set_attendant", { p_conversation: "c1", p_user: "u2" });
    expect(spy.mock.calls.some((c) => (c[0] as { queryKey: unknown[] }).queryKey[0] === "conversations")).toBe(true);
  });

  it("reports how many open deals changed in the success toast", async () => {
    rpc.mockResolvedValue({ data: { opportunities_updated: 2 }, error: null });
    const { W } = wrapper();
    const { result } = renderHook(() => useSetResponsible(), { wrapper: W });
    await act(async () => { await result.current.mutateAsync({ leadId: "l1", userId: "u1" }); });
    expect(toast.success).toHaveBeenCalledWith("Responsável atualizado em 2 negócios abertos");
  });

  it("shows a specific message for owner_not_in_team", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "owner_not_in_team: x" } });
    const { W } = wrapper();
    const { result } = renderHook(() => useSetResponsible(), { wrapper: W });
    await act(async () => { await result.current.mutateAsync({ leadId: "l1", userId: "x" }).catch(() => {}); });
    expect(toast.error).toHaveBeenCalledWith("Essa pessoa não pertence à equipe.");
  });
});
