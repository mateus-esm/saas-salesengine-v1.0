import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  appsecretProof,
  backoffDelayMs,
  GRAPH_VERSION,
  hmacSha256Hex,
  metaErrorMessage,
  oauthDialogUrl,
  parseSignedRequest,
  randomToken,
  sha256Hex,
  verifyChallenge,
  verifySignature,
} from "./meta.ts";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

Deno.test("hmacSha256Hex - RFC 4231 caso 2", async () => {
  assertEquals(
    await hmacSha256Hex("Jefe", "what do ya want for nothing?"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

Deno.test("sha256Hex - vetor conhecido", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("appsecretProof = HMAC(token, app secret)", async () => {
  assertEquals(await appsecretProof("tok123", "secret"), await hmacSha256Hex("secret", "tok123"));
});

Deno.test("verifySignature - aceita assinatura válida do corpo cru", async () => {
  const body = '{"object":"page","entry":[]}';
  const sig = "sha256=" + (await hmacSha256Hex("appsecret", body));
  assert(await verifySignature(body, sig, "appsecret"));
});

Deno.test("verifySignature - recusa ausente, prefixo errado, corpo alterado, segredo errado", async () => {
  const body = '{"object":"page","entry":[]}';
  const hex = await hmacSha256Hex("appsecret", body);
  assertEquals(await verifySignature(body, null, "appsecret"), false);
  assertEquals(await verifySignature(body, "", "appsecret"), false);
  assertEquals(await verifySignature(body, "sha1=" + hex, "appsecret"), false);
  assertEquals(await verifySignature(body.replace("page", "pagf"), "sha256=" + hex, "appsecret"), false);
  assertEquals(await verifySignature(body, "sha256=" + hex, "other"), false);
  assertEquals(await verifySignature(body, "sha256=" + hex, ""), false);
});

Deno.test("verifyChallenge", () => {
  const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "123" });
  assertEquals(verifyChallenge(ok, "vt"), "123");
  assertEquals(verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }), "vt"), null);
  assertEquals(verifyChallenge(new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": "vt", "hub.challenge": "1" }), "vt"), null);
  assertEquals(verifyChallenge(ok, ""), null);
});

async function signedRequest(payload: Record<string, unknown>, secret: string) {
  const p = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64url(hexToBytes(await hmacSha256Hex(secret, p)));
  return `${sig}.${p}`;
}

Deno.test("parseSignedRequest - válido devolve user_id", async () => {
  const sr = await signedRequest({ algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1 }, "s3cr3t");
  const r = await parseSignedRequest(sr, "s3cr3t");
  assertEquals(r?.user_id, "1234567890");
});

Deno.test("parseSignedRequest - adulterado, segredo errado ou algoritmo errado → null", async () => {
  const sr = await signedRequest({ algorithm: "HMAC-SHA256", user_id: "1" }, "s3cr3t");
  const [sig] = sr.split(".");
  const forged = `${sig}.${b64url(new TextEncoder().encode(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "2" })))}`;
  assertEquals(await parseSignedRequest(forged, "s3cr3t"), null);
  assertEquals(await parseSignedRequest(sr, "other"), null);
  assertEquals(await parseSignedRequest("garbage", "s3cr3t"), null);
  const md5 = await signedRequest({ algorithm: "MD5", user_id: "1" }, "s3cr3t");
  assertEquals(await parseSignedRequest(md5, "s3cr3t"), null);
});

Deno.test("oauthDialogUrl - config_id, state, code, sem scope", () => {
  const u = new URL(oauthDialogUrl({ appId: "111", configId: "222", redirectUri: "https://app.x/cb", state: "st" }));
  assertEquals(u.origin + u.pathname, `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  assertEquals(u.searchParams.get("client_id"), "111");
  assertEquals(u.searchParams.get("config_id"), "222");
  assertEquals(u.searchParams.get("redirect_uri"), "https://app.x/cb");
  assertEquals(u.searchParams.get("state"), "st");
  assertEquals(u.searchParams.get("response_type"), "code");
  assertEquals(u.searchParams.get("override_default_response_type"), "true");
  assertEquals(u.searchParams.has("scope"), false);
});

Deno.test("randomToken - base64url, único", () => {
  const a = randomToken();
  assert(/^[A-Za-z0-9_-]{43}$/.test(a), a);
  assert(a !== randomToken());
});

Deno.test("metaErrorMessage - classifica os códigos do Meta", () => {
  const t = metaErrorMessage({ code: 190, message: "Error validating access token" });
  assertEquals(t.code, "token_invalid");
  assertEquals(t.reconnect, true);
  assertEquals(metaErrorMessage({ code: 102 }).code, "token_invalid");
  assertEquals(metaErrorMessage({ code: 200 }).code, "permission_missing");
  assertEquals(metaErrorMessage({ code: 10 }).code, "permission_missing");
  assertEquals(metaErrorMessage({ code: 200 }).reconnect, true);
  for (const c of [4, 17, 32, 613, 80005]) assertEquals(metaErrorMessage({ code: c }).code, "rate_limited");
  assertEquals(metaErrorMessage({ code: 4 }).reconnect, false);
  assertEquals(metaErrorMessage({ code: 100, message: "Lead access denied by Leads Access Manager" }).code, "leads_access");
  const u = metaErrorMessage({ code: 1, message: "boom" });
  assertEquals(u.code, "unknown");
  assert(u.message.length > 0);
});

Deno.test("backoffDelayMs - 2^n min até 6 h", () => {
  assertEquals(backoffDelayMs(0), 60_000);
  assertEquals(backoffDelayMs(3), 8 * 60_000);
  assertEquals(backoffDelayMs(20), 6 * 3600_000);
});
