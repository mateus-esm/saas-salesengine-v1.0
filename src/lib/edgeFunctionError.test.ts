import { describe, expect, it } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { edgeFunctionError } from "./edgeFunctionError";

describe("admin Edge Function errors", () => {
  it("shows the duplicate email response instead of the generic non-2xx message", async () => {
    const response = new Response(JSON.stringify({ error: "Este email já está cadastrado.", code: "email_exists" }), { status: 409 });
    const error = await edgeFunctionError(new FunctionsHttpError(response), "Erro ao criar usuário");
    expect(error.message).toBe("Este email já está cadastrado.");
    expect(response.bodyUsed).toBe(false);
  });

  it("also surfaces gateway messages", async () => {
    const response = new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 });
    expect((await edgeFunctionError(new FunctionsHttpError(response), "Fallback")).message).toBe("Invalid JWT");
  });

  it("preserves transport failures and handles non-JSON responses", async () => {
    expect((await edgeFunctionError({ message: "Failed to fetch" }, "Fallback")).message).toBe("Failed to fetch");
    const error = new FunctionsHttpError(new Response("Bad gateway", { status: 502 }));
    expect((await edgeFunctionError(error, "Fallback")).message).toBe(error.message);
    expect((await edgeFunctionError({}, "Fallback")).message).toBe("Fallback");
  });
});
