// SE-FIX-001 — digitar na Etapa não pode virar um UPDATE por caractere.
//
// O componente é renderizado sozinho de propósito: assim o teste cobre só a
// regra do rascunho local (digita à vontade, persiste no blur, obedece o
// servidor fora de edição) sem precisar mockar Supabase, React Query, dnd-kit
// nem os Popovers/Selects do StagesEditor.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DraftField } from "../DraftField";

const textbox = () => screen.getByRole("textbox") as HTMLInputElement;

// Focar/tirar o foco sem depender de qual evento o React usa para delegar.
// O React 16 ouvia `focus`/`blur` (captura no document); o React 17+ passou a
// delegar por `focusin`/`focusout`. Em navegador real os dois eventos saem no
// mesmo gesto, então o React registra onFocus/onBlur para apenas UM deles —
// disparar os dois nomes cobre as duas estratégias sem chamar o handler duas
// vezes. Os eventos são construídos na mão para o nome ser exatamente
// `focusin`/`focusout` (e não depender de como o fireEvent deriva o type).
const focusField = (el: HTMLElement) => {
  fireEvent(el, new FocusEvent("focus", { bubbles: false }));
  fireEvent(el, new FocusEvent("focusin", { bubbles: true }));
};

const blurField = (el: HTMLElement) => {
  fireEvent(el, new FocusEvent("blur", { bubbles: false }));
  fireEvent(el, new FocusEvent("focusout", { bubbles: true }));
};

describe("DraftField", () => {
  it("digitar não chama o servidor; o blur chama uma vez com o texto final", () => {
    const onCommit = vi.fn();
    render(<DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />);

    focusField(textbox());
    fireEvent.change(textbox(), { target: { value: "Etapa 1" } });
    fireEvent.change(textbox(), { target: { value: "Etapa 12" } });
    expect(onCommit).not.toHaveBeenCalled();

    blurField(textbox());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Etapa 12");
  });

  it("sair do campo sem mudar nada não chama o servidor", () => {
    const onCommit = vi.fn();
    render(<DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />);

    focusField(textbox());
    blurField(textbox());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("valor novo do servidor aparece quando o campo não está em edição", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />,
    );
    rerender(<DraftField value="Etapa renomeada" onCommit={onCommit} aria-label="Nome da etapa" />);
    expect(textbox().value).toBe("Etapa renomeada");
  });

  it("refetch no meio da digitação não apaga o rascunho", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />,
    );

    focusField(textbox());
    fireEvent.change(textbox(), { target: { value: "Etapa em edição" } });
    // Chega um valor DIFERENTE do servidor (invalidação da mutation anterior,
    // realtime). Tem de ser diferente, senão o efeito nem roda e o teste
    // passaria sem exercitar a guarda de edição.
    rerender(<DraftField value="Etapa antiga" onCommit={onCommit} aria-label="Nome da etapa" />);
    expect(textbox().value).toBe("Etapa em edição");

    blurField(textbox());
    // O texto do usuário vence o que chegou do servidor durante a edição.
    expect(onCommit).toHaveBeenCalledWith("Etapa em edição");
  });

  it("sair sem digitar não grava por cima de um valor novo do servidor", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />,
    );

    focusField(textbox());
    // Outra aba/usuário renomeou a etapa enquanto este campo estava focado.
    rerender(
      <DraftField value="Etapa do servidor" onCommit={onCommit} aria-label="Nome da etapa" />,
    );

    blurField(textbox());
    expect(onCommit).not.toHaveBeenCalled();
    expect(textbox().value).toBe("Etapa do servidor");
  });

  it("digitar e voltar ao valor do servidor não gera UPDATE inútil", () => {
    const onCommit = vi.fn();
    render(<DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />);

    focusField(textbox());
    fireEvent.change(textbox(), { target: { value: "Etapa X" } });
    fireEvent.change(textbox(), { target: { value: "Etapa" } });
    blurField(textbox());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Enter sai do campo e quem persiste é o blur (não insere linha nova)", () => {
    const onCommit = vi.fn();
    render(<DraftField value="Etapa" onCommit={onCommit} aria-label="Nome da etapa" />);

    const el = textbox();
    const blurSpy = vi.spyOn(el, "blur");
    focusField(el);
    fireEvent.change(el, { target: { value: "Etapa 1" } });

    fireEvent.keyDown(el, { key: "Enter" });
    // O Enter não grava direto: só pede o blur, que é o único caminho de commit.
    expect(onCommit).not.toHaveBeenCalled();
    expect(blurSpy).toHaveBeenCalled();

    blurField(el);
    expect(onCommit).toHaveBeenCalledWith("Etapa 1");
  });

  it("multiline (Textarea) também persiste no blur", () => {
    const onCommit = vi.fn();
    render(
      <DraftField value="" onCommit={onCommit} multiline rows={2} aria-label="Descrição da etapa" />,
    );

    focusField(textbox());
    fireEvent.change(textbox(), { target: { value: "Avaliando proposta" } });
    expect(onCommit).not.toHaveBeenCalled();
    blurField(textbox());
    expect(onCommit).toHaveBeenCalledWith("Avaliando proposta");
  });
});
