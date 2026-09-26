// Reproduz "salvar sequência" no build real e registra tela + rede + banco.
// uso: node repro.mjs <baseUrl> <outDir> <prefixo>
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const [base, out, tag] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const keys = JSON.parse(fs.readFileSync("/tmp/serev004/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev004/session.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const EQUIPE = "939d7dd8-592c-4fda-946e-3568f2909904"; // Solo Energia (time do dono)
const log = [];
const note = (k, v) => { log.push({ t: new Date().toISOString(), k, v }); console.log(k, typeof v === "string" ? v : JSON.stringify(v)); };
const snapshot = async (label) => {
  const { data: seqs } = await db.from("cadence_sequences").select("id,name,active,trigger_entry_ids,created_at,updated_at").eq("equipe_id", EQUIPE).like("name", "[SE-REV-004%").order("created_at");
  const ids = (seqs ?? []).map((s) => s.id);
  const { data: steps } = ids.length ? await db.from("cadence_steps").select("sequence_id,position,offset_minutes,message_template,active,updated_at").in("sequence_id", ids).order("position") : { data: [] };
  note(`DB ${label}`, { sequences: seqs, steps });
  return { seqs, steps };
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
await page.addInitScript((s) => localStorage.setItem("sb-egxzsivzqlqadoqpgfby-auth-token", JSON.stringify(s)), session);
page.on("console", (m) => { if (m.type() === "error") note("console.error", m.text().slice(0, 300)); });
page.on("request", (r) => { if (r.url().includes("/functions/v1/outreach") && r.method() === "POST") note("→ outreach", r.postData()); });
page.on("response", async (r) => { if (r.url().includes("/functions/v1/outreach") && r.request().method() === "POST") note(`← outreach ${r.status()}`, (await r.text().catch(() => "")).slice(0, 600)); });
const toasts = async () => (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");

await snapshot("antes");
await page.goto(`${base}/outreach`);
await page.getByRole("button", { name: "Salvar sequência" }).waitFor({ timeout: 60000 });
await page.screenshot({ path: `${out}/${tag}-01-tela-inicial.png`, fullPage: true });

// Passo A — criar
const card = page.locator("div.rounded-lg.border, div").filter({ has: page.getByText("Regra e mensagens") }).last();
const nameInput = page.locator("label:has-text('Nome') + input");
await nameInput.fill(`[SE-REV-004 ${tag}] criar`);
await page.locator("label:has-text('Porta de entrada') + button").click();
const option = page.getByRole("option").nth(1);
note("porta escolhida", await option.innerText());
await option.click();
await page.locator("textarea").first().fill("teste SE-REV-004 (não enviar: sequência inativa)");
await page.getByRole("button", { name: "Salvar sequência" }).click();
await page.waitForTimeout(6000);
note("toasts após criar", await toasts());
await page.screenshot({ path: `${out}/${tag}-02-apos-criar.png`, fullPage: true });
const afterCreate = await snapshot("após criar");

// Passo B — editar a mesma sequência (nome, texto, offset) e salvar
await page.waitForTimeout(1500);
await nameInput.fill(`[SE-REV-004 ${tag}] EDITADA`);
await page.locator("textarea").first().fill("texto EDITADO SE-REV-004");
await page.getByRole("button", { name: "Mensagem" }).click();
await page.locator("textarea").nth(1).fill("segundo passo SE-REV-004");
note("draft na tela antes de salvar edição", { name: await nameInput.inputValue(), textareas: await page.locator("textarea").evaluateAll((els) => els.map((e) => e.value)) });
await page.getByRole("button", { name: "Salvar sequência" }).click();
await page.waitForTimeout(6000);
note("toasts após editar", await toasts());
note("draft na tela após salvar edição", { name: await nameInput.inputValue(), textareas: await page.locator("textarea").evaluateAll((els) => els.map((e) => e.value)) });
await page.screenshot({ path: `${out}/${tag}-03-apos-editar.png`, fullPage: true });
await snapshot("após editar");

// Passo C — recarregar e ver o que a tela mostra
await page.reload();
await page.getByRole("button", { name: "Salvar sequência" }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
const btn = page.getByRole("button", { name: /SE-REV-004/ });
note("sequências na lista após reload", await btn.allInnerTexts());
if (await btn.count()) { await btn.last().click(); await page.waitForTimeout(800); }
note("draft após reload+abrir", { name: await nameInput.inputValue(), textareas: await page.locator("textarea").evaluateAll((els) => els.map((e) => e.value)) });
await page.screenshot({ path: `${out}/${tag}-04-apos-reload.png`, fullPage: true });
fs.writeFileSync(`${out}/${tag}-log.json`, JSON.stringify(log, null, 1));
await browser.close();
