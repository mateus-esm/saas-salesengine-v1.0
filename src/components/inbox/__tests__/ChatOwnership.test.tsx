import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ChatOwnershipBlock } from "../ChatOwnershipBlock";
import { ConversationHeader } from "../ConversationHeader";
import { buildChatOwnership } from "@/lib/chatOwnership";

const members = [
  { id: "u1", name: "Ana Souza", email: "a@x.com" },
  { id: "u2", name: "Bruno Lima", email: "b@x.com" },
];
const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? null;

describe("chat ownership UI (Sprint Suporte 1 · #8/#11)", () => {
  it("shows Responsável and Atendente as separate, labelled rows", () => {
    render(
      <ChatOwnershipBlock
        ownership={buildChatOwnership({ responsibleId: "u1", attendantId: "u2", nameOf })}
        members={members}
        onSetResponsible={() => {}}
        onSetAttendant={() => {}}
      />,
    );
    expect(screen.getByText("Responsável")).toBeTruthy();
    expect(screen.getByText("Atendente")).toBeTruthy();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getByText("Bruno Lima")).toBeTruthy();
  });

  it("says 'Sem responsável' / 'Sem atendente' when each is empty", () => {
    render(
      <ChatOwnershipBlock
        ownership={buildChatOwnership({ responsibleId: null, attendantId: null, nameOf })}
        members={members}
      />,
    );
    expect(screen.getByText("Sem responsável")).toBeTruthy();
    expect(screen.getByText("Sem atendente")).toBeTruthy();
  });

  it("header shows both roles compactly", () => {
    render(
      <ConversationHeader
        session={
          {
            id: "c1",
            customerName: "Cliente",
            customerPhone: "5585",
            status: "human_handling",
            responsibleId: "u2",
            leadResponsibleId: "u1",
            tags: [],
            crmData: { value: 0, stage: "", notes: "" },
            messages: [],
          } as never
        }
        teamMembers={[
          { id: "u1", nome_completo: "Ana Souza", email: "a@x.com" },
          { id: "u2", nome_completo: "Bruno Lima", email: "b@x.com" },
        ] as never}
        onToggleHandoff={() => {}}
        onUpdateCRM={() => {}}
      />,
    );
    expect(screen.getByTestId("header-ownership").textContent).toBe("Resp.: Ana · Atend.: Bruno");
  });
});
