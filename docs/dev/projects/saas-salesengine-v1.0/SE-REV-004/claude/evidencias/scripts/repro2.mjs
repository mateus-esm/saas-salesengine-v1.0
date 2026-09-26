// Cenário do dono: salvar → ir ao chat → voltar ao Outreach → "editar" e salvar.
// uso: node repro2.mjs <baseUrl> <outDir> <tag>
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const [base, out, tag] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const keys = JSON.parse(fs.readFileSync("/tmp/serev004/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev004/session.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const EQUIPE = "939d7dd8-592c-4fda-946e-3568f2909904";
const log = [];
const note = (k, v) => { log.push({ t: new Date().toISOString(), k, v }); console.log(k, typeof v === "string" ? v : JSON.stringify(v)); };
const snapshot = async (label) => {
  const { data: seqs } = await db.from("cadence_sequences").select("id,name,active,trigger_entry_ids,created_at,updated_at").eq("equipe_id", EQUIPE).like("name", `[SE-REV-004 ${tag}%`).order("created_at");
  note(`DB ${label}`, seqs);
  return seqs;
};
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
await page.addInitScript((s) => localStorage.setItem("sb-egxzsivzqlqadoqpgfby-auth-token", JSON.stringify(s)), session);
page.on("request", (r) => { if (r.url().includes("/functions/v1/outreach") && r.method() === "POST") { const b = JSON.parse(r.postData() ?? "{}"); note("→ outreach", b.action === "upsert-sequence" ? { action: b.action, id: b.sequence?.id ?? null, name: b.sequence?.name } : { action: b.action }); } });
const nameInput = page.locator("label:has-text('Nome') + input");
const form = async () => ({ name: await nameInput.inputValue(), porta: await page.locator("label:has-text('Porta de entrada') + button").innerText(), textos: await page.locator("textarea").evaluateAll((els) => els.map((e) => e.value)), novaSelecionada: (await page.getByRole("button", { name: "Nova sequência" }).getAttribute("class"))?.includes("bg-secondary") });
const spaNav = (path) => page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
const ready = () => page.getByRole("button", { name: /Salvar sequência|Criar sequência|Salvar alterações/ }).waitFor({ timeout: 60000 });

await snapshot("antes");
await page.goto(`${base}/outreach`); await ready();
// 1) cria a regra, como às 23:10:58
await nameInput.fill(`[SE-REV-004 ${tag}] regra do dono`);
await page.locator("label:has-text('Porta de entrada') + button").click(); await page.getByRole("option").nth(1).click();
await page.locator("textarea").first().fill("Oi");
await page.getByRole("button", { name: /Salvar sequência|Criar sequência|Salvar alterações/ }).click(); await page.waitForTimeout(5000);
note("form após salvar", await form());
await page.screenshot({ path: `${out}/${tag}-A-salvou.png`, fullPage: true });
await snapshot("após criar");
// 2) vai ao chat (como às 23:12–23:13) e volta ao Outreach
await spaNav("/chat"); await page.waitForTimeout(3000);
await spaNav("/outreach"); await ready(); await page.waitForTimeout(2500);
note("form ao voltar para /outreach", await form());
await page.screenshot({ path: `${out}/${tag}-B-voltou.png`, fullPage: true });
// 3) o dono "ajusta a regra" no formulário que vê e salva (como às 23:14:28)
await nameInput.fill(`[SE-REV-004 ${tag}] regra do dono (ajustada)`);
if ((await page.locator("label:has-text('Porta de entrada') + button").innerText()).includes("Selecione")) { await page.locator("label:has-text('Porta de entrada') + button").click(); await page.getByRole("option").nth(1).click(); }
if (!(await page.locator("textarea").first().inputValue())) await page.locator("textarea").first().fill("Oi");
await page.getByRole("button", { name: /Salvar sequência|Criar sequência|Salvar alterações/ }).click(); await page.waitForTimeout(5000);
note("toasts", (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | "));
note("lista após salvar", await page.getByRole("button", { name: /SE-REV-004/ }).allInnerTexts());
await page.screenshot({ path: `${out}/${tag}-C-salvou-de-novo.png`, fullPage: true });
await snapshot("após 'ajustar' e salvar");
fs.writeFileSync(`${out}/${tag}-log.json`, JSON.stringify(log, null, 1));
await browser.close();
