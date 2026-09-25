// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveCaller } from "./tenant-auth.ts";

function fakeClient() {
  let authCalls = 0;
  const client = {
    auth: {
      getUser: async () => {
        authCalls++;
        return { data: { user: { id: "user-jwt" } }, error: null };
      },
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          if (table === "equipes" && filters.webhook_secret === "segredo") {
            return { data: { id: "tenant-secret" }, error: null };
          }
          if (table === "profiles") {
            return {
              data: { id: "profile", equipe_id: "tenant-jwt" },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
  return { client, getAuthCalls: () => authCalls };
}

Deno.test("segredo do webhook tem precedência sobre bearer/JWT", async () => {
  const fake = fakeClient();
  const req = new Request("https://rev.test/outreach", {
    headers: {
      "x-webhook-secret": "segredo",
      "Authorization": "Bearer token-que-nao-identifica-o-tenant",
    },
  });
  const caller = await resolveCaller(req, new URL(req.url), fake.client, {});
  assertEquals(caller, {
    equipeId: "tenant-secret",
    defaultTriggerSource: "http",
    profileId: null,
  });
  assertEquals(fake.getAuthCalls(), 0);
});

Deno.test("sem segredo, JWT resolve o perfil", async () => {
  const fake = fakeClient();
  const req = new Request("https://rev.test/outreach", {
    headers: { "Authorization": "Bearer jwt" },
  });
  const caller = await resolveCaller(req, new URL(req.url), fake.client, {});
  assertEquals(caller.equipeId, "tenant-jwt");
  assertEquals(caller.profileId, "profile");
  assertEquals(fake.getAuthCalls(), 1);
});
