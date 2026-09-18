// Sprint 8.2 · discovery_q&a — o discovery do lado de quem só tem o link.
//
// A pessoa não está logada, então nada aqui passa pelo cliente autenticado do
// Supabase: é `fetch` direto na edge function pública, como PublicForm faz.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveryAnswers, DiscoveryDocument } from "@/lib/discovery/types";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-discovery`;

export interface DiscoveryApiError {
  error: string;
  field?: string;
  status: number;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw {
      error: (data as { error?: string }).error ?? "internal_error",
      field: (data as { field?: string }).field,
      status: response.status,
    } as DiscoveryApiError;
  }
  return data as T;
}

const key = (token: string) => ["public-discovery", token] as const;

export function useDiscoveryDocument(token: string) {
  return useQuery({
    queryKey: key(token),
    queryFn: () => call<DiscoveryDocument>({ action: "get", token }),
    // O link é de uso único na prática; recarregar a cada foco só criaria
    // corrida com o autosave em voo.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useSaveDiscovery(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: DiscoveryAnswers) =>
      call<{ progress: number; answers: DiscoveryAnswers }>({ action: "save", token, answers }),
    onSuccess: (data) => {
      qc.setQueryData<DiscoveryDocument>(key(token), (old) =>
        old ? { ...old, progress: data.progress, answers: data.answers } : old,
      );
    },
  });
}

export function useSubmitDiscovery(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<{ status: "submitted"; link_agenda: string }>({ action: "submit", token }),
    onSuccess: (data) => {
      qc.setQueryData<DiscoveryDocument>(key(token), (old) =>
        old ? { ...old, status: "submitted", link_agenda: data.link_agenda || old.link_agenda } : old,
      );
    },
  });
}
