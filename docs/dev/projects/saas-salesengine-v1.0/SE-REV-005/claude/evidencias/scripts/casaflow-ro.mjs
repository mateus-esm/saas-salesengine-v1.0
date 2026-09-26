// Captura SOMENTE LEITURA: a tela renderizada com a resposta de list-sequences
// da Casa Flow (código novo local, x-webhook-secret do tenant). Toda outra
// chamada de function é recusada aqui — nada é gravado.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const [out] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev005/session.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const { data: team } = await db.from("equipes").select("webhook_secret").eq("id", "aa33b576-3959-4a81-8e73-4027039ea2ce").single();
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await p.addInitScript((s) => localStorage.setItem("sb-egxzsivzqlqadoqpgfby-auth-token", JSON.stringify(s)), session);
const blocked = [];
await p.route("**/functions/v1/**", async (route) => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  const body = JSON.parse(req.postData() ?? "{}");
  if (!req.url().endsWith("/outreach") || body.action !== "list-sequences") { blocked.push(req.url() + " " + body.action); return route.fulfill({ status: 403, body: "{\"error\":\"bloqueado: captura somente leitura\"}" }); }
  const r = await fetch("http://127.0.0.1:8101/", { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": team.webhook_secret, apikey: keys.anon }, body: JSON.stringify({ action: "list-sequences" }) });
  const local = await r.json();
  return route.fulfill({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ ...local, gpt_channels: [], gpt_channels_error: null }) });
});
await p.goto("http://127.0.0.1:4273/outreach");
await p.getByText("Mensagem de abertura", { exact: true }).waitFor({ timeout: 60000 }); await p.waitForTimeout(1500);
await p.getByTestId("opener-card").screenshot({ path: `${out}/casa-flow-mensagem-de-abertura-e-portas.png` });
await p.locator("label:has-text('Porta de entrada') + button").click(); await p.waitForTimeout(500);
const options = await p.getByRole("option").allInnerTexts();
await p.screenshot({ path: `${out}/casa-flow-select-de-portas.png` });
fs.writeFileSync(`${out}/casa-flow-tela.json`, JSON.stringify({ opcoes_do_select: options, texto_mensagem_abertura: await p.locator("#opener-message").inputValue(), aviso_ocultas: await p.getByTestId("opener-card").getByTestId("hidden-entries").innerText(), chamadas_bloqueadas: blocked }, null, 1));
console.log(fs.readFileSync(`${out}/casa-flow-tela.json`, "utf8"));
await b.close();
