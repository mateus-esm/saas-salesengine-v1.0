// Sprint 17 — página pública do status de uma exclusão de dados pedida pelo Meta.
// O link vem do callback (meta-data-deletion); o código é toda a autorização.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Status = { status: "received" | "completed"; received_at: string; completed_at: string | null };

export default function DataDeletionStatus() {
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^[a-f0-9]{16,64}$/.test(code)) {
      setError("Código de confirmação inválido.");
      return;
    }
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-data-deletion?code=${code}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setError("Não encontramos um pedido com este código.")))
      .catch(() => setError("Não foi possível consultar agora. Tente de novo em instantes."));
  }, [code]);

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-sm">
      <h1 className="text-xl font-semibold">Exclusão de dados — Rev</h1>
      {error ? <p>{error}</p> : null}
      {data ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p><strong>Código:</strong> <code>{code}</code></p>
          <p><strong>Status:</strong> {data.status === "completed" ? "Concluída" : "Recebida"}</p>
          <p><strong>Recebida em:</strong> {when(data.received_at)}</p>
          <p><strong>Concluída em:</strong> {when(data.completed_at)}</p>
          <p className="text-muted-foreground">
            A conexão do seu usuário do Facebook com o Rev foi removida e os tokens de acesso foram apagados.
            Dados de clientes (leads) pertencem à empresa que usa o Rev; para pedidos sobre eles, fale com essa empresa.
          </p>
        </div>
      ) : null}
      {!data && !error ? <p className="text-muted-foreground">Consultando…</p> : null}
    </main>
  );
}
