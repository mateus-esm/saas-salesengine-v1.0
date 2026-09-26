// Guarda de abertura com leads REAIS do time de teste (Solo Energia), código
// novo local SEM GPT_MAKER_TOKEN (nenhuma mensagem pode sair). event_key
// explícito com prefixo SE-REV-005 — as linhas são apagadas no fim.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const [out] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev005/session.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const EM_ATENDIMENTO = "896321ee-1ec9-4cc3-b964-a6d10bb975ab";
const NOVO = "3c06f9cc-c84c-45f0-98d9-587e0dbdd7e6";
const stamp = Date.now();
const log = [];
const note = (k, v) => { log.push({ k, v }); console.log(k, JSON.stringify(v)); };
const state = async (label) => {
  for (const [name, id] of [["em_atendimento", EM_ATENDIMENTO], ["novo", NOVO]]) {
    const { data: events } = await db.from("conversation_open_events").select("id, event_key, status, error_code, error_message, attempts, trigger_source, created_at, updated_at").eq("lead_id", id).order("created_at");
    const { data: last } = await db.from("messages").select("created_at, sender_type").eq("lead_id", id).eq("sender_type", "customer").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { count: agentMsgs } = await db.from("messages").select("id", { count: "exact", head: true }).eq("lead_id", id).eq("sender_type", "agent");
    const { data: convs } = await db.from("conversations").select("id, status, opened_at, opened_via").eq("lead_id", id);
    note(`${label} · ${name}`, { lead_id: id, ultima_msg_do_cliente: last?.created_at ?? null, msgs_agent: agentMsgs, conversations: convs, conversation_open_events: events });
  }
};
const open = async (leadId, key) => {
  const r = await fetch("http://127.0.0.1:8102/", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, apikey: keys.anon }, body: JSON.stringify({ action: "open", lead_id: leadId, event_key: key }) });
  return { http: r.status, body: await r.json() };
};
note("agora", new Date().toISOString());
await state("ANTES");
const keyA = `SE-REV-005-guarda-em-atendimento-${stamp}`;
const keyB = `SE-REV-005-guarda-novo-${stamp}`;
note("open lead EM ATENDIMENTO", await open(EM_ATENDIMENTO, keyA));
note("open lead NOVO", await open(NOVO, keyB));
note("open lead EM ATENDIMENTO de novo (mesma chave)", await open(EM_ATENDIMENTO, keyA));
await state("DEPOIS");
const { count: rows } = await db.from("conversation_open_events").select("id", { count: "exact", head: true }).eq("event_key", keyA);
note("linhas com a chave do lead em atendimento (UNIQUE equipe_id,event_key)", rows);
// Limpeza: só as linhas desta prova.
const { data: removed, error } = await db.from("conversation_open_events").delete().like("event_key", "SE-REV-005-%").select("id, event_key, status, error_code");
note("LIMPEZA conversation_open_events SE-REV-005-%", error ?? removed);
await state("APÓS LIMPEZA");
fs.writeFileSync(out, JSON.stringify(log, null, 1));
