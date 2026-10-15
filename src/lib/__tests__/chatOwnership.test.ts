import { describe, it, expect } from "vitest";
import { buildChatOwnership, summarizeChatDeal } from "../chatOwnership";

const names: Record<string, string> = { u1: "Ana Souza", u2: "Bruno Lima" };
const nameOf = (id: string | null | undefined) => (id ? names[id] ?? null : null);

describe("buildChatOwnership (Sprint Suporte 1 · #8/#11)", () => {
  it("keeps Responsável and Atendente as two separate roles", () => {
    const o = buildChatOwnership({ responsibleId: "u1", attendantId: "u2", nameOf });
    expect(o.responsible).toEqual({ id: "u1", name: "Ana Souza", label: "Ana Souza" });
    expect(o.attendant).toEqual({ id: "u2", name: "Bruno Lima", label: "Bruno Lima" });
  });

  it("says who is missing instead of mixing the roles", () => {
    const o = buildChatOwnership({ responsibleId: null, attendantId: "u1", nameOf });
    expect(o.responsible.label).toBe("Sem responsável");
    expect(o.attendant.label).toBe("Ana Souza");
    const none = buildChatOwnership({ responsibleId: "u1", attendantId: null, nameOf });
    expect(none.attendant.label).toBe("Sem atendente");
  });

  it("flags a removed user", () => {
    const o = buildChatOwnership({ responsibleId: "gone", attendantId: null, nameOf });
    expect(o.responsible.label).toBe("Usuário removido");
  });

  it("compact text for the header", () => {
    const o = buildChatOwnership({ responsibleId: "u1", attendantId: "u2", nameOf });
    expect(o.compact).toBe("Resp.: Ana · Atend.: Bruno");
  });
});

describe("summarizeChatDeal", () => {
  it("prefers the open deal and exposes stage/value", () => {
    const s = summarizeChatDeal([
      { id: "a", status: "won", value: 1 },
      { id: "b", status: "open", value: 2 },
    ] as never);
    expect(s?.id).toBe("b");
  });
  it("returns the first deal when none is open, null when empty", () => {
    expect(summarizeChatDeal([{ id: "a", status: "lost" }] as never)?.id).toBe("a");
    expect(summarizeChatDeal([])).toBeNull();
  });
});
