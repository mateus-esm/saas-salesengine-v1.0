import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync("/tmp/serev005/keys.json", "utf8"));
const session = JSON.parse(fs.readFileSync("/tmp/serev005/session.json", "utf8"));
const r = await fetch("http://127.0.0.1:8101/", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, apikey: keys.anon }, body: JSON.stringify({ action: "delete-sequence", sequence_id: process.argv[2] }) });
console.log(r.status, await r.text());
