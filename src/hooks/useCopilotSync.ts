// src/hooks/useCopilotSync.ts
//
// Sprint 6.1 · EPIC D · D4 — single-sync SSE consumer for the Telemetry HUD.
// Sprint 6.10 · W2 — optional persistKey for navigation/reload resilience.
//
// The backend GET /api/v1/sync/stream emits `data: {json}\n\n` events as the
// Workflow runs, ending with a terminal `done`. Native EventSource cannot send
// the Authorization header, so we read the stream with fetch + ReadableStream.

import { useCallback, useEffect, useRef, useState } from "react";
import { getCopilotToken, requireCopilotUrl } from "@/services/copilot";
import { useSyncJobPersistence } from "./useSyncJobPersistence";

export type HudEvent = {
  kind: string;
  seq: number;
  run_id?: string;
  opportunity_id?: string | null;
  payload: Record<string, unknown>;
};

export interface SyncQuery {
  lead_id: string;
  opportunity_id?: string;
  pipeline_id?: string;
}

/**
 * useCopilotSync — SSE-based single sync consumer.
 *
 * @param persistKey  Optional localStorage key. When provided, sync state
 *                    (events, running, error) is persisted and restored
 *                    across navigation / page reload.
 */
export function useCopilotSync(persistKey?: string) {
  // Initialise persistence; the hook returns stable references for
  // updateState / clear and stable values for hasPersisted / state.
  // We destructure before useState so initializers can read loaded state.
  const {
    state: restoredState,
    hasPersisted: hadPersisted,
    updateState: persistUpdate,
  } = useSyncJobPersistence(persistKey);

  const [events, setEvents] = useState<HudEvent[]>(() => {
    if (hadPersisted && restoredState.events.length > 0) {
      return restoredState.events;
    }
    return [];
  });
  const [running, setRunning] = useState(() => {
    if (hadPersisted) return restoredState.running;
    return false;
  });
  const [error, setError] = useState<string | null>(() => {
    if (hadPersisted) return restoredState.error;
    return null;
  });
  const abortRef = useRef<AbortController | null>(null);

  // Persist state changes to localStorage when persistKey is provided.
  useEffect(() => {
    if (!persistKey) return;
    persistUpdate({ events, running, error });
  }, [events, running, error, persistKey, persistUpdate]);

  const start = useCallback(async (q: SyncQuery) => {
    setEvents([]);
    setError(null);
    setRunning(true);

    const token = await getCopilotToken();
    const params = new URLSearchParams({ lead_id: q.lead_id });
    if (q.opportunity_id) params.set("opportunity_id", q.opportunity_id);
    if (q.pipeline_id) params.set("pipeline_id", q.pipeline_id);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const baseUrl = requireCopilotUrl();
      await fetchStream(
        `${baseUrl}/api/v1/sync/stream?${params.toString()}`,
        token,
        controller.signal,
        (ev) => {
          setEvents((prev) => [...prev, ev]);
          if (ev.kind === "done") setRunning(false);
        },
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
        setRunning(false);
      }
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  return { events, running, error, start, stop };
}

// ── fetch-based SSE reader ────────────────────────────────────────────────

async function fetchStream(
  url: string,
  token: string,
  signal: AbortSignal,
  onEvent: (ev: HudEvent) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Sync stream returned ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6)) as HudEvent;
          onEvent(parsed);
        } catch {
          // Malformed JSON — skip
        }
      }
    }
  }
}
