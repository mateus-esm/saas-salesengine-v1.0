// Gera uma sessão real (sem enviar e-mail) para o e-mail dado. Grava em session.json (600).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const URL = "https://egxzsivzqlqadoqpgfby.supabase.co";
const email = process.argv[2];
const admin = createClient(URL, keys.service, { auth: { persistSession: false } });
const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw error;
const anon = createClient(URL, keys.anon, { auth: { persistSession: false } });
const { data, error: e2 } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (e2) throw e2;
fs.writeFileSync("/tmp/serev005/session.json", JSON.stringify(data.session), { mode: 0o600 });
console.log("sessão ok para", data.user.email, "expira", new Date(data.session.expires_at * 1000).toISOString());
