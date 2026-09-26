// Remove SOMENTE as sequências de teste desta task (nome "[SE-REV-004 ...") do time Solo Energia.
import { createClient } from "@supabase/supabase-js"; import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync("/tmp/serev004/keys.json", "utf8"));
const db = createClient("https://egxzsivzqlqadoqpgfby.supabase.co", keys.service, { auth: { persistSession: false } });
const { data: seqs } = await db.from("cadence_sequences").select("id,name").eq("equipe_id", "939d7dd8-592c-4fda-946e-3568f2909904").like("name", "[SE-REV-004%");
const ids = (seqs ?? []).map((s) => s.id);
const { count } = ids.length ? await db.from("cadence_enrollments").select("id", { count: "exact", head: true }).in("sequence_id", ids) : { count: 0 };
if (count) throw new Error(`há ${count} inscrições nessas sequências — não apago`);
if (ids.length) { const { error } = await db.from("cadence_sequences").delete().in("id", ids); if (error) throw error; }
console.log("removidas:", seqs?.map((s) => s.name));
