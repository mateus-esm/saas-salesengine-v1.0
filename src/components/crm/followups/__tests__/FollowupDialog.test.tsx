import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useFollowups", () => ({
  useOutreachLine: () => ({ hasLine: true, label: null, isLoading: false, isError: false, refetch: () => {} }),
  useScheduleFollowup: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));

import { FollowupDialog } from "../FollowupDialog";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

describe("FollowupDialog", () => {
  it("só reinicia o formulário ao abrir, não quando o dono muda com o diálogo aberto", () => {
    const props = { onOpenChange: () => {}, opportunityId: "o1" };
    const { rerender } = render(<FollowupDialog {...props} open ownerId="u1" />);
    fireEvent.click(screen.getByRole("switch", { name: /Enviar mensagem ao cliente/ }));
    expect(screen.getByLabelText("Mensagem")).toBeTruthy();
    rerender(<FollowupDialog {...props} open ownerId="u2" />);
    expect(screen.getByLabelText("Mensagem")).toBeTruthy(); // não reiniciou
    rerender(<FollowupDialog {...props} open={false} ownerId="u2" />);
    rerender(<FollowupDialog {...props} open ownerId="u2" />);
    expect(screen.queryByLabelText("Mensagem")).toBeNull(); // reiniciou ao reabrir
  });
});
