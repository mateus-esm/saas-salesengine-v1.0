import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  accountsOf,
  chooseFields,
  normalizeRows,
  parseFieldList,
  requestFields,
  syncWindow,
  windsorError,
  windsorUrl,
} from "./windsor.ts";

Deno.test("parseFieldList aceita lista, objetos, {data} e mapa", () => {
  assertEquals(parseFieldList(["date", "spend"]), ["date", "spend"]);
  assertEquals(parseFieldList([{ id: "date" }, { name: "spend" }]), ["date", "spend"]);
  assertEquals(parseFieldList({ data: [{ field: "ad_id" }] }), ["ad_id"]);
  assertEquals(parseFieldList({ date: {}, spend: {} }), ["date", "spend"]);
  assertEquals(parseFieldList({ error: "Not authorized" }), null);
  assertEquals(parseFieldList(null), null);
});

Deno.test("chooseFields fica com o primeiro candidato que a conta tem", () => {
  const map = chooseFields("facebook", ["date", "ad_id", "adid", "spend", "totalcost", "actions_lead", "campaign"]);
  assertEquals(map.external_ad_id, "ad_id");
  assertEquals(map.spend, "spend");
  assertEquals(map.platform_leads, "actions_lead");
  assertEquals(map.campaign_name, "campaign");
  assertEquals(map.reach, undefined);
  // Sem lista: o primeiro de cada.
  assertEquals(chooseFields("google_ads", null).adset_external_id, "ad_group_id");
  assertEquals(requestFields({ day: "date", spend: "spend", ad_name: "spend" }), ["date", "spend"]);
});

Deno.test("normalizeRows: uma linha por anúncio por dia, somando e tolerando texto", () => {
  const map = chooseFields("facebook", null);
  const rows = normalizeRows("facebook", [
    { date: "2026-11-22", ad_id: 120211, ad_name: "P002-V3 | Carmona", campaign_id: "120210", campaign: "2026-11 | MSG", spend: "10.505", impressions: 1000, actions_video_view: 300 },
    { date: "2026-11-22", ad_id: "120211", spend: 4.5, impressions: "200" },
    { date: "2026-11-23T00:00:00", ad_id: "120211", spend: 1 },
    { date: null, ad_id: "x", spend: 9 },
    { date: "2026-11-23", spend: 9 },
  ], map);
  assertEquals(rows.length, 2);
  const d22 = rows.find((r) => r.day === "2026-11-22")!;
  assertEquals(d22.platform, "meta");
  assertEquals(d22.external_ad_id, "120211");
  assertEquals(d22.spend, 15.01);
  assertEquals(d22.impressions, 1200);
  assertEquals(d22.video_3s, 300);
  assertEquals(d22.campaign_external_id, "120210");
  assertEquals(d22.ad_name, "P002-V3 | Carmona");
});

Deno.test("normalizeRows: sem ID de anúncio, o grupo/campanha faz as vezes", () => {
  const map = chooseFields("google_ads", null);
  const rows = normalizeRows("google_ads", [
    { date: "2026-11-22", campaign_id: "99", campaign: "Busca | Fortaleza", spend: 30 },
  ], map);
  assertEquals(rows[0].external_ad_id, "campaign:99");
  assertEquals(rows[0].ad_name, "Busca | Fortaleza");
  assertEquals(rows[0].platform, "google");
});

Deno.test("windsorError: os dois formatos documentados e a chave inválida", () => {
  assertEquals(windsorError(200, { data: [] }), null);
  assertEquals(windsorError(401, { error: { code: "authentication_error", message: "Invalid API key provided" } }), { message: "Invalid API key provided", auth: true });
  assertEquals(windsorError(200, { error: "Not authorized" })?.auth, true);
  assertEquals(windsorError(400, { error: { code: "invalid_request", message: "bad field" } }), { message: "bad field", auth: false });
  assertEquals(windsorError(500, null), { message: "HTTP 500", auth: false });
});

Deno.test("windsorUrl põe a chave só na query e pula parâmetro vazio", () => {
  const u = new URL(windsorUrl("facebook", "k-1", { fields: "date,spend", date_from: "2026-11-01", select_accounts: undefined }));
  assertEquals(u.pathname, "/facebook");
  assertEquals(u.searchParams.get("api_key"), "k-1");
  assertEquals(u.searchParams.get("fields"), "date,spend");
  assertEquals(u.searchParams.has("select_accounts"), false);
});

Deno.test("accountsOf e syncWindow", () => {
  const rows = normalizeRows("facebook", [
    { date: "2026-11-22", ad_id: "1", account_id: "act_9", account_name: "Solo" },
    { date: "2026-11-22", ad_id: "2", account_id: "act_9", account_name: "Solo" },
  ], chooseFields("facebook", null));
  assertEquals(accountsOf("facebook", rows), [{ source: "facebook", id: "act_9", name: "Solo" }]);
  assertEquals(syncWindow(3, new Date("2026-11-23T15:00:00Z")), { from: "2026-11-21", to: "2026-11-23" });
});
