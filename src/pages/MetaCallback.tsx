// Sprint 17 — volta do diálogo OAuth do Meta. Troca o código no servidor
// (integrations-meta · connect) e volta para Integrações.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { callMeta, metaKeys } from "@/hooks/useMeta";
import { metaCallbackParams } from "@/lib/meta";

export default function MetaCallback() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // o código do Meta vale uma vez só
    once.current = true;
    const p = metaCallbackParams(search);
    if (p.kind === "error") {
      setError(p.message);
      return;
    }
    // Tira o código da barra de endereço antes de qualquer outra coisa.
    window.history.replaceState(null, "", "/integracoes/meta/callback");
    callMeta({ action: "connect", code: p.code, state: p.state, origin: window.location.origin })
      .then(() => {
        qc.invalidateQueries({ queryKey: metaKeys.status });
        toast.success("Meta conectado");
        navigate("/integracoes?open=meta", { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [search, navigate, qc]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      {error ? (
        <>
          <p className="text-sm">{error}</p>
          <Button asChild variant="outline"><Link to="/integracoes?open=meta">Voltar para Integrações</Link></Button>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-[#0866FF]" />
          <p className="text-sm text-muted-foreground">Conectando com o Meta…</p>
        </>
      )}
    </div>
  );
}
