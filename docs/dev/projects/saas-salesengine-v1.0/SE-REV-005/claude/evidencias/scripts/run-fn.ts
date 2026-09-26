// Sobe uma edge function local numa porta fixa (std serve usa 8000 por padrão).
// uso: PORT=8101 deno run -A run-fn.ts /caminho/index.ts
const port = Number(Deno.env.get("PORT"));
const origListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = (opts: any) => origListen({ ...opts, port, hostname: "127.0.0.1" });
await import(Deno.args[0]);
