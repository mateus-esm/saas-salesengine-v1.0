// Edição não salva da sequência + "Salvar canal" → a edição sobrevive?
import { chromium } from "playwright"; import fs from "node:fs";
const [base, out, tag] = process.argv.slice(2);
const session = JSON.parse(fs.readFileSync("/tmp/serev004/session.json", "utf8"));
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
await page.addInitScript((s) => localStorage.setItem("sb-egxzsivzqlqadoqpgfby-auth-token", JSON.stringify(s)), session);
const nameInput = page.locator("label:has-text('Nome') + input");
await page.goto(`${base}/outreach`); await page.getByRole("button", { name: /Salvar sequência|Criar sequência|Salvar alterações/ }).waitFor({ timeout: 60000 });
await page.getByRole("button", { name: /SE-REV-004 base\] EDITADA/ }).click(); await page.waitForTimeout(800);
await nameInput.fill("[SE-REV-004 base] EDITADA + edição não salva");
await page.locator("textarea").first().fill("texto digitado e ainda não salvo");
console.log("antes de 'Salvar canal':", JSON.stringify({ name: await nameInput.inputValue(), texto: await page.locator("textarea").first().inputValue() }));
await page.getByRole("button", { name: "Salvar canal" }).click(); await page.waitForTimeout(5000);
const after = { name: await nameInput.inputValue(), texto: await page.locator("textarea").first().inputValue() };
console.log("depois de 'Salvar canal':", JSON.stringify(after));
await page.screenshot({ path: `${out}/${tag}-salvar-canal.png`, fullPage: true });
fs.writeFileSync(`${out}/${tag}-salvar-canal.json`, JSON.stringify(after));
await b.close();
