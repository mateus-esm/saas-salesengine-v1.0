// SE-REV-005 — prova da UI no build real (vite build + preview), sessão real do
// time de teste Solo Energia, banco de produção. As chamadas a
// /functions/v1/outreach e /functions/v1/start-conversation são desviadas para
// o CÓDIGO NOVO rodando localmente (deno, sem GPT_MAKER_TOKEN: nada é enviado a
// provider). Em list-sequences, os canais do provedor vêm da função deployada
// (que tem o token) — o resto da resposta é do código novo.
//
// uso: node ui.mjs <outDir>
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const [out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const URL = "https://egxzsivzqlqadoqpgfby.supabase.co";
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev005/session.json", "utf8"));
const db = createClient(URL, keys.service, { auth: { persistSession: false } });
const EQUIPE = "939d7dd8-592c-4fda-946e-3568f2909904"; // Solo Energia (time do dono)
const IMPORT_ENTRY = "2c61b619-5738-47f1-bd6e-1caf54350104"; // "Importação / API"
const TEST_LEAD = "3c06f9cc-c84c-45f0-98d9-587e0dbdd7e6";
const CASA_FLOW_SEQ = "ad36c612-cc76-4e1c-a74e-d8129b69bd1b"; // "Novo Lead" (inativa) de OUTRO time
const log = [];
const note = (k, v) => { log.push({ t: new Date().toISOString(), k, v }); console.log(k, typeof v === "string" ? v : JSON.stringify(v)); };
const save = () => fs.writeFileSync(`${out}/log.json`, JSON.stringify(log, null, 1));

const opener = async (label) => {
  const { data } = await db.from("conversation_opener_settings")
    .select("enabled, first_message, trigger_entry_ids, updated_at").eq("equipe_id", EQUIPE).single();
  note(`DB opener ${label}`, data);
  return data;
};
const testSeqs = async (label) => {
  const { data: seqs } = await db.from("cadence_sequences").select("id,name,active,trigger_entry_ids").eq("equipe_id", EQUIPE).like("name", "[SE-REV-005%");
  const ids = (seqs ?? []).map((s) => s.id);
  const { data: enr } = ids.length ? await db.from("cadence_enrollments").select("id,sequence_id,lead_id,status,cancel_reason").in("sequence_id", ids) : { data: [] };
  const eids = (enr ?? []).map((e) => e.id);
  const { data: jobs } = eids.length ? await db.from("outreach_jobs").select("id,enrollment_id,step_position,status,skip_reason,run_after").in("enrollment_id", eids) : { data: [] };
  note(`DB sequências de teste ${label}`, { sequences: seqs, enrollments: enr, jobs });
  return { seqs, enr, jobs };
};
const api = async (port, body) => {
  const r = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, apikey: keys.anon }, body: JSON.stringify(body) });
  return { http: r.status, body: await r.json() };
};

// ── Preparação: sequência de teste INATIVA com uma inscrição pendente ────────
const original = await opener("antes");
await testSeqs("antes da preparação");
const created = await api(8101, {
  action: "upsert-sequence",
  sequence: { name: "[SE-REV-005] apagar pela tela", active: false, trigger_event: "lead_intake", trigger_entry_ids: [IMPORT_ENTRY] },
  steps: [
    { position: 0, offset_minutes: 1440, message_template: "teste SE-REV-005 {{lead.first_name}} (inativa, nunca enviada)" },
    { position: 1, offset_minutes: 2880, message_template: "teste SE-REV-005 passo 2" },
  ],
});
note("preparação: upsert-sequence (código novo)", created);
const seqId = created.body.sequence.id;
// Inscrição direta (a sequência é inativa; jobs só vencem amanhã): é o estado
// "inscrições e jobs pendentes" que o apagar precisa cancelar.
const enr = await db.rpc("_outreach_enroll", { p_sequence_id: seqId, p_lead_id: TEST_LEAD, p_opportunity_id: null, p_enrollment_key: "api:SE-REV-005-teste", p_trigger_ref: { se_rev_005: true } });
note("preparação: _outreach_enroll", enr.error ?? enr.data);
await testSeqs("após preparação");

// Escopo de time: apagar sequência de OUTRO time (Casa Flow) é recusado.
note("delete-sequence de outro time (Casa Flow)", await api(8101, { action: "delete-sequence", sequence_id: CASA_FLOW_SEQ }));
const { data: stillThere } = await db.from("cadence_sequences").select("id,name,equipe_id,active").eq("id", CASA_FLOW_SEQ).maybeSingle();
note("DB sequência da Casa Flow continua lá", stillThere);

// ── Navegador ───────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await page.addInitScript((s) => localStorage.setItem("sb-egxzsivzqlqadoqpgfby-auth-token", JSON.stringify(s)), session);
page.on("console", (m) => { if (m.type() === "error") note("console.error", m.text().slice(0, 300)); });
const forward = (port) => async (route) => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret" } });
  const body = req.postData() ?? "{}";
  const r = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers: { ...req.headers(), host: "127.0.0.1" }, body });
  let text = await r.text();
  const action = JSON.parse(body).action;
  if (port === 8101 && action === "list-sequences") {
    const prod = await (await route.fetch()).json();
    const local = JSON.parse(text);
    text = JSON.stringify({ ...local, gpt_channels: prod.gpt_channels, gpt_channels_error: prod.gpt_channels_error });
  }
  note(`→ ${port === 8101 ? "outreach" : "start-conversation"} ${action} ${r.status}`, action === "list-sequences" ? "(lista)" : text.slice(0, 500));
  return route.fulfill({ status: r.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: text });
};
await page.route("**/functions/v1/outreach", forward(8101));
await page.route("**/functions/v1/start-conversation", forward(8102));
const toasts = async () => (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");

await page.goto("http://127.0.0.1:4273/outreach");
await page.getByText("Mensagem de abertura", { exact: true }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-tela-inicial.png`, fullPage: true });
note("mensagem de abertura na tela", await page.locator("#opener-message").inputValue());
note("preview na tela", await page.getByTestId("opener-message-preview").innerText());

// 1) variável inválida é sinalizada e bloqueia o salvar
await page.locator("#opener-message").fill("Oi {{lead.nome}}! Aqui é da {{tenant.name}}.");
await page.waitForTimeout(300);
note("erro mostrado", await page.getByTestId("opener-card").getByRole("alert").innerText());
note("botão salvar desabilitado?", await page.getByRole("button", { name: "Salvar mensagem de abertura" }).isDisabled());
await page.getByTestId("opener-card").screenshot({ path: `${out}/02-variavel-invalida.png` });

// 2) editar a mensagem (clicando numa variável) e salvar
const edited = "Olá {{lead.first_name}}! Aqui é da {{tenant.name}}. Vi que você se cadastrou — posso te ajudar?";
await page.locator("#opener-message").fill("Olá ! Aqui é da {{tenant.name}}. Vi que você se cadastrou — posso te ajudar?");
await page.locator("#opener-message").evaluate((el) => el.setSelectionRange(4, 4));
await page.getByTestId("opener-message-variables").getByRole("button", { name: "{{lead.first_name}}" }).click();
await page.waitForTimeout(300);
note("texto após clicar na variável", await page.locator("#opener-message").inputValue());
await page.getByRole("button", { name: "Salvar mensagem de abertura" }).click();
await page.waitForTimeout(4000);
note("toasts após salvar", await toasts());
await page.getByTestId("opener-card").screenshot({ path: `${out}/03-mensagem-editada-salva.png` });
const afterEdit = await opener("depois de editar pela tela");
note("persistiu o texto editado?", afterEdit.first_message === edited);

// 3) recarregar: a tela mostra o que está no banco
await page.reload();
await page.getByText("Mensagem de abertura", { exact: true }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
note("após reload, texto na tela", await page.locator("#opener-message").inputValue());

// 4) restaurar o texto original (mesma tela)
await page.locator("#opener-message").fill(original.first_message);
await page.getByRole("button", { name: "Salvar mensagem de abertura" }).click();
await page.waitForTimeout(4000);
const restored = await opener("depois de restaurar pela tela");
note("restaurado igual ao original?", restored.first_message === original.first_message && restored.enabled === original.enabled && JSON.stringify(restored.trigger_entry_ids) === JSON.stringify(original.trigger_entry_ids));

// 5) lista de portas do Select da sequência
await page.getByRole("button", { name: /\[SE-REV-005\] apagar pela tela/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/04-sequencia-teste-aberta-variaveis-nos-passos.png`, fullPage: true });
await page.locator("label:has-text('Porta de entrada') + button").click();
await page.waitForTimeout(500);
note("opções do Select de portas", await page.getByRole("option").allInnerTexts());
await page.screenshot({ path: `${out}/05-select-de-portas.png` });
await page.keyboard.press("Escape");

// 6) apagar a sequência de teste, com confirmação
await page.getByRole("button", { name: "Apagar", exact: true }).click();
await page.waitForTimeout(500);
note("texto do diálogo", await page.getByRole("alertdialog").innerText());
await page.screenshot({ path: `${out}/06-confirmar-apagar.png` });
await page.getByRole("button", { name: "Apagar sequência" }).click();
await page.waitForTimeout(5000);
note("toasts após apagar", await toasts());
note("sequências na lista", await page.locator("div").filter({ has: page.getByText("Sequências", { exact: true }) }).last().innerText());
await page.screenshot({ path: `${out}/07-apos-apagar.png`, fullPage: true });
await testSeqs("depois de apagar pela tela");

// Idempotência: apagar de novo o mesmo id não faz nada.
note("delete-sequence repetido", await api(8101, { action: "delete-sequence", sequence_id: seqId }));
save();
await browser.close();
