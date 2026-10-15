import { describe, expect, it } from "vitest";
import { isMetaWindowClosedMessage, readSendErrorMessage } from "@/lib/send-errors";

describe("send-errors", () => {
  it("lê o código do corpo da resposta 422", async () => {
    const err = { message: "Edge Function returned a non-2xx", context: { json: async () => ({ error: "meta_window_closed: x" }) } };
    const msg = await readSendErrorMessage(err);
    expect(isMetaWindowClosedMessage(msg)).toBe(true);
  });
  it("cai na mensagem do erro quando o corpo não é JSON", async () => {
    const err = { message: "boom", context: { json: async () => { throw new Error("x"); } } };
    expect(await readSendErrorMessage(err)).toBe("boom");
    expect(isMetaWindowClosedMessage("boom")).toBe(false);
    expect(isMetaWindowClosedMessage(null)).toBe(false);
  });
});
