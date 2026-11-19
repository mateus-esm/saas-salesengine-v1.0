import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WhatsAppComposer } from "./WhatsAppComposer";

it("preserva os marcadores de envio e formata o texto selecionado na prévia", () => {
  function Editor() {
    const [value, setValue] = useState("Venda ganha\nParabéns!");
    return <WhatsAppComposer id="msg" value={value} onChange={setValue} preview={value}
      variables={[]} previewLabel="Prévia" />;
  }
  render(<Editor />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  input.setSelectionRange(0, 5);
  fireEvent.click(screen.getByRole("button", {name: "Negrito"}));
  expect(input.value).toBe("*Venda* ganha\nParabéns!");
  const bubble = screen.getByTestId("msg-preview");
  expect(bubble.querySelector("strong")?.textContent).toBe("Venda");
  expect(bubble.textContent).toContain("Venda ganha\nParabéns!");
});
