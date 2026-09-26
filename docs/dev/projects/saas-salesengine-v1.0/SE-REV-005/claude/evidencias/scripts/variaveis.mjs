import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const [out] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev005/session.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const EQ = "939d7dd8-592c-4fda-946e-3568f2909904";
const call = async (port, body) => { const r = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, apikey: keys.anon }, body: JSON.stringify(body) }); return { http: r.status, body: await r.json() }; };
const snap = async () => ({
  opener: (await db.from("conversation_opener_settings").select("first_message, updated_at").eq("equipe_id", EQ).single()).data,
  sequencias_teste: (await db.from("cadence_sequences").select("id").like("name", "[SE-REV-005%")).data,
});
const r = { antes: await snap() };
r.update_settings_invalida = await call(8102, { action: "update-settings", first_message: "Oi {{lead.nome}}!" });
r.update_settings_chave_mal_fechada = await call(8102, { action: "update-settings", first_message: "Oi {lead.first_name}!" });
r.upsert_sequence_invalida = await call(8101, { action: "upsert-sequence", sequence: { name: "[SE-REV-005] invalida", active: false, trigger_event: "lead_intake", trigger_entry_ids: ["2c61b619-5738-47f1-bd6e-1caf54350104"] }, steps: [{ position: 0, offset_minutes: 1440, message_template: "Oi {{cliente.nome}}" }] });
r.upsert_sequence_ativa_em_porta_orfa_outro_time = "não testado aqui: porta órfã só existe na Casa Flow (coberto por entries.test.ts)";
r.depois = await snap();
r.nada_mudou = JSON.stringify(r.antes) === JSON.stringify(r.depois);
fs.writeFileSync(out, JSON.stringify(r, null, 1)); console.log(JSON.stringify(r, null, 1));
