// src/hooks/useCopilotSync.ts
//
// Sprint 6.1 · EPIC D · D4 — single-sync SSE consumer for the Telemetry HUD.
//
// The backend GET /api/v1/sync/stream emits `data: {json}\n\n` events as the
// Workflow runs, ending with a terminal `done`. Native EventSource cannot send
// the Authorization header, so we read the stream with fetch + ReadableStream.

import { useCallback, useRef, useState } from "react";
import { getCopilotToken, requireCopilotUrl } from "@/services/copilot";

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

export function useCopilotSync() {
  const [events, setEvents] = useState<HudEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      }
      setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return { events, running, error, start, stop };
}

async function fetchStream(
  url: string,
  token: string | undefined,
  signal: AbortSignal,
  onEvent: (e: HudEvent) => void,
): Promise<void> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Sync stream error ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.replace(/^data:\s?/, "").trim();
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as HudEvent);
      } catch {
        // ignore malformed frames
      }
    }
  }
}
