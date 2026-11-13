import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));

import { FollowupForm } from "../FollowupForm";
import type { FollowupFormValue } from "@/lib/followups";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const base: FollowupFormValue = {
  date: "2026-11-20",
  time: "09:00",
  ownerId: null,
  reason: "",
  notifyOwner: true,
  sendMessage: false,
  channel: "whatsapp",
  messageText: "",
  returnStageId: null,
  willReturn: true,
};

const stages = [
  { id: "s1", name: "Novo" },
  { id: "s2", name: "Contato" },
];

describe("FollowupForm", () => {
  it("sem linha de WhatsApp: o interruptor de mensagem fica desabilitado e explica por quê", () => {
    render(<FollowupForm value={base} onChange={() => {}} mode="manual" hasLine={false} />);
    expect(screen.getByRole("switch", { name: /Enviar mensagem ao cliente/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Configure uma linha de WhatsApp em Outreach/)).toBeTruthy();
  });

  it("com linha: mostra o nome da linha e deixa o e-mail desabilitado", () => {
    render(
      <FollowupForm
        value={{ ...base, sendMessage: true }}
        onChange={() => {}}
        mode="manual"
        hasLine
        lineLabel="Comercial"
      />,
    );
    expect(screen.getByRole("switch", { name: /Enviar mensagem ao cliente/ }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/WhatsApp — Comercial/)).toBeTruthy();
    expect(screen.getByText(/E-mail — em breve/)).toBeTruthy();
    expect(screen.getByLabelText("Mensagem")).toBeTruthy();
    expect(screen.getByText("{{lead.first_name}}")).toBeTruthy();
  });

  it("não mostra a mensagem quando o interruptor está desligado", () => {
    render(<FollowupForm value={base} onChange={() => {}} mode="manual" hasLine lineLabel="Comercial" />);
    expect(screen.queryByLabelText("Mensagem")).toBeNull();
  });

  it("ligar o interruptor avisa o chamador", () => {
    const onChange = vi.fn();
    render(<FollowupForm value={base} onChange={onChange} mode="manual" hasLine lineLabel="Comercial" />);
    fireEvent.click(screen.getByRole("switch", { name: /Enviar mensagem ao cliente/ }));
    expect(onChange).toHaveBeenCalledWith({ ...base, sendMessage: true });
  });

  it("modo manual não mostra motivo nem 'vai voltar'", () => {
    render(<FollowupForm value={base} onChange={() => {}} mode="manual" hasLine lineLabel="X" />);
    expect(screen.queryByText("Vai voltar?")).toBeNull();
  });

  it("modo recycle mostra motivo e 'Vai voltar?'", () => {
    render(
      <FollowupForm
        value={base}
        onChange={() => {}}
        mode="recycle"
        hasLine
        lineLabel="X"
        stages={stages}
        reasons={["Sem orçamento", "Sem resposta"]}
      />,
    );
    expect(screen.getByText("Motivo")).toBeTruthy();
    expect(screen.getByText("Vai voltar?")).toBeTruthy();
    expect(screen.getByText("Quando chegar a data")).toBeTruthy();
    expect(screen.getByLabelText("Manter no Reciclo")).toBeTruthy();
    expect(screen.getByLabelText("Voltar para a etapa")).toBeTruthy();
  });

  it("recycle sem volta: só o motivo, sem data, aviso nem mensagem", () => {
    render(
      <FollowupForm
        value={{ ...base, willReturn: false }}
        onChange={() => {}}
        mode="recycle"
        hasLine
        lineLabel="X"
        stages={stages}
        reasons={["Sem orçamento"]}
      />,
    );
    expect(screen.getByText("Motivo")).toBeTruthy();
    expect(screen.queryByText("Data e hora")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
