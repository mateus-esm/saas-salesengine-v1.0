const env = await Deno.readTextFile("/data/.openclaw/.env");
const token = env.split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))!.split("=").slice(1).join("=").replace(/["' ]/g, "");
const q = async (query: string) => (await (await fetch("https://api.supabase.com/v1/projects/egxzsivzqlqadoqpgfby/database/query", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) })).json());
const teams = await q("select id, nome, webhook_secret from equipes where webhook_secret is not null and coalesce(workspace_id,'')<>'' and coalesce(gpt_maker_agent_id,'')<>''");
for (const t of teams) {
  const r = await fetch("https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/outreach", { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-secret": t.webhook_secret }, body: JSON.stringify({ action: "list-sequences" }) });
  const d = await r.json().catch(() => ({}));
  const ch = (d.gpt_channels ?? []).filter((c: any) => ["WHATSAPP", "Z_API", "CLOUD_API"].includes(String(c.type).toUpperCase()));
  const conn = (ty: string) => ch.filter((c: any) => c.type === ty && c.connected === true).length;
  console.log(`${t.nome} | http=${r.status} err=${d.gpt_channels_error ?? d.error ?? ""} | WHATSAPP=${conn("WHATSAPP")} Z_API=${conn("Z_API")} CLOUD_API=${conn("CLOUD_API")} | auto-pick antes=${conn("WHATSAPP")===1?"ok":conn("WHATSAPP")>1?"ambiguo":"falha"} depois=${conn("WHATSAPP")+conn("Z_API")===1?"ok":conn("WHATSAPP")+conn("Z_API")>1?"ambiguo":"falha"}`);
}
