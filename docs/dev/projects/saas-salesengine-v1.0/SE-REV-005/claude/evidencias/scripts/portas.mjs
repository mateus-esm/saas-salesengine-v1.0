// Portas da equipe: função deployada (antes) x código novo local (depois).
// Somente leitura (action list-sequences). O segredo não é impresso.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const [equipe, out] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const { data: team } = await db.from("equipes").select("nome, webhook_secret").eq("id", equipe).single();
const call = async (url) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": team.webhook_secret, apikey: keys.anon }, body: JSON.stringify({ action: "list-sequences" }) });
  const j = await r.json();
  return { http: r.status, entries: j.entries, hidden_entries: j.hidden_entries ?? "(campo não existe nesta versão)" };
};
const result = {
  equipe, tenant: team.nome, at: new Date().toISOString(),
  antes_producao: await call("https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/outreach"),
  depois_codigo_novo: await call("http://127.0.0.1:8101/"),
};
fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
