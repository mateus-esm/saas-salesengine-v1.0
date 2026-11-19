import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface DealChoice { id: string; lead_id: string; label: string }

export function DealPicker({ value, onChange, leadId }: {
  value: string | null; onChange: (deal: DealChoice | null) => void; leadId?: string | null;
}) {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [choosing, setChoosing] = useState(false);
  const team = profile?.equipe_id;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["deal-picker", team, leadId, choosing ? search : value, choosing],
    enabled: !!team && (choosing || !!value),
    queryFn: async (): Promise<DealChoice[]> => {
      const { data, error } = await (supabase as any).rpc("crm_find_deals", {
        q: choosing ? search.trim() : "", contact: leadId ?? null, selected: choosing ? null : value,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  return <div className="space-y-1">
    <span className="text-sm font-medium">Oportunidade</span>
    <div className="flex gap-1"><Button type="button" variant="outline" className="min-w-0 flex-1 justify-start truncate"
      onClick={() => setChoosing(!choosing)} aria-expanded={choosing}>
      {value ? (!choosing && data?.[0]?.label || "Oportunidade vinculada") : "Selecionar oportunidade"}
    </Button>{value && <Button type="button" variant="ghost" onClick={() => { onChange(null); setChoosing(false); }}>Desvincular</Button>}</div>
    {choosing && <div className="rounded-md border p-2">
      <Input aria-label="Buscar oportunidade" placeholder="Nome, contato ou funil" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <div className="max-h-32 overflow-auto">{(data ?? []).map((deal) => <button type="button" key={deal.id}
        className="block w-full rounded p-1 text-left text-sm hover:bg-muted"
        onClick={() => { onChange(deal); setChoosing(false); setSearch(""); }}>{deal.label}</button>)}
      {!data?.length && <span className="text-xs text-muted-foreground">{isError ? "Falha ao buscar" : isLoading ? "Buscando…" : "Nenhuma oportunidade"}</span>}</div>
    </div>}
  </div>;
}
