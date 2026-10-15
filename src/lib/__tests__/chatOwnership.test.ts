import { describe, it, expect } from "vitest";
import {
  buildChatOwnership,
  summarizeChatDeal,
  resolveResponsibleId,
  countDealsToReassign,
  reassignNotice,
  ownershipErrorMessage,
} from "../chatOwnership";

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

describe("Responsável vem do negócio aberto", () => {
  const opps = [
    { status: "won", owner_id: "w" },
    { status: "open", owner_id: "u2" },
    { status: "open", owner_id: "u3" },
  ] as never;
  it("uses the open deal's owner, not the lead's", () => {
    expect(resolveResponsibleId(opps, "lead-resp")).toBe("u2");
  });
  it("an open deal without owner shows no owner (no fallback)", () => {
    expect(resolveResponsibleId([{ status: "open", owner_id: null }] as never, "lead-resp")).toBeNull();
  });
  it("falls back to the lead only without an open deal", () => {
    expect(resolveResponsibleId([{ status: "won", owner_id: "w" }] as never, "lead-resp")).toBe("lead-resp");
    expect(resolveResponsibleId([], null)).toBeNull();
  });
  it("counts only open deals that change owner and warns for more than one", () => {
    expect(countDealsToReassign(opps, "u2")).toBe(1);
    expect(countDealsToReassign(opps, "u9")).toBe(2);
    expect(reassignNotice(2)).toBe("2 negócios abertos terão o responsável alterado");
    expect(reassignNotice(1)).toBeNull();
    expect(reassignNotice(0)).toBeNull();
  });
});

describe("ownershipErrorMessage", () => {
  it("maps database codes to specific pt-BR messages", () => {
    expect(ownershipErrorMessage({ message: "owner_not_in_team: x" }, "f")).toBe("Essa pessoa não pertence à equipe.");
    expect(ownershipErrorMessage({ message: "lead_not_found" }, "f")).toBe("Contato não encontrado.");
    expect(ownershipErrorMessage({ message: "conversation_not_found" }, "f")).toBe("Conversa não encontrada.");
    expect(ownershipErrorMessage({ message: "boom" }, "fallback")).toBe("fallback");
  });
});
