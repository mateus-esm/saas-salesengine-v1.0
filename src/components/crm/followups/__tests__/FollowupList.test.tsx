import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state: { data: unknown; isLoading: boolean; isError: boolean } = { data: [], isLoading: false, isError: false };
const cancel = vi.fn();
const refetch = vi.fn();

vi.mock("@/hooks/useFollowups", () => ({
  useFollowups: () => ({ ...state, refetch }),
  useCancelFollowup: () => ({ mutate: cancel, isPending: false }),
}));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: (id: string | null) => (id ? "Ana" : null), isLoading: false }),
}));

import { FollowupList } from "../FollowupList";
import type { Followup } from "@/lib/followups";

const mk = (over: Partial<Followup>): Followup => ({
  id: "f1",
  opportunity_id: "o1",
  kind: "manual",
  reason: null,
  owner_id: "u1",
  due_at: "2026-11-20T12:00:00.000Z",
  notify_owner: true,
  send_message: false,
  channel: "whatsapp",
  message_text: null,
  from_stage_id: null,
  return_stage_id: null,
  status: "scheduled",
  result: {},
  created_at: "2026-11-13T12:00:00.000Z",
  executed_at: null,
  ...over,
});

describe("FollowupList", () => {
  beforeEach(() => {
    state.data = [];
    state.isLoading = false;
    state.isError = false;
    cancel.mockClear();
  });

  it("carregando", () => {
    state.isLoading = true;
    render(<FollowupList opportunityId="o1" />);
    expect(screen.getByLabelText("Carregando follow-ups")).toBeTruthy();
    state.isLoading = false;
  });

  it("erro com tentar de novo", () => {
    state.isError = true;
    render(<FollowupList opportunityId="o1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalled();
    state.isError = false;
  });

  it("vazio", () => {
    state.data = [];
    render(<FollowupList opportunityId="o1" />);
    expect(screen.getByText("Nenhum follow-up agendado.")).toBeTruthy();
  });

  it("agendado mostra a data em Brasília e o botão de cancelar", () => {
    state.data = [mk({ send_message: true, message_text: "Oi {{lead.first_name}}" })];
    render(<FollowupList opportunityId="o1" />);
    expect(screen.getByText(/20\/11\/2026/)).toBeTruthy();
    expect(screen.getByText(/09:00/)).toBeTruthy();
    expect(screen.getByText("Agendado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar follow-up" }));
    expect(cancel).toHaveBeenCalledWith("f1");
  });

  it("feito mostra o resultado e não tem cancelar", () => {
    state.data = [
      mk({
        status: "done",
        send_message: true,
        message_text: "Oi",
        result: { message: "sent", notified: true },
        executed_at: "2026-11-20T12:00:05.000Z",
      }),
    ];
    render(<FollowupList opportunityId="o1" />);
    expect(screen.getByText("Feito")).toBeTruthy();
    expect(screen.getByText("Mensagem enviada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar follow-up" })).toBeNull();
  });
});
