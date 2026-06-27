// src/hooks/useCopilotSweep.ts
//
// Sprint 6.1 · EPIC D · D5 — Global Sweep trigger + Realtime HUD consumer.
// Sprint 6.10 · W2 — optional persistKey for navigation/reload resilience.
//
// sweep() POSTs /api/v1/sync/sweep and gets back a run_id. We then subscribe to
// copilot_run_events filtered by that run_id (Supabase Realtime, mirroring
// useCopilotRealtime) and feed the same HudEvent[] shape the D4 modal renders,
// so the sweep reuses the single TelemetryHUD.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweep as sweepRequest } from "@/services/copilot";
import { useSyncJobPersistence } from "./useSyncJobPersistence";
import type { HudEvent } from "@/hooks/useCopilotSync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface RunEventRow {
  kind: string;
  seq: number;
  run_id: string;
  opportunity_id: string | null;
  payload: Record<string, unknown>;
}

/**
 * useCopilotSweep — Realtime-based sweep consumer.
 *
 * @param persistKey  Optional localStorage key. When provided, sweep state
 *                    (events, running, total, runId, error) is persisted and
 *                    restored across navigation / page reload.
 */
export function useCopilotSweep(persistKey?: string) {
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
  const [total, setTotal] = useState<number | null>(() => {
    if (hadPersisted) return restoredState.total;
    return null;
  });
  const [error, setError] = useState<string | null>(() => {
    if (hadPersisted) return restoredState.error;
    return null;
  });
  const [runId, setRunId] = useState<string | null>(() => {
    if (hadPersisted) return restoredState.runId;
    return null;
  });
  const channelRef = useRef<unknown>(null);

  // Persist state changes to localStorage when persistKey is provided.
  useEffect(() => {
    if (!persistKey) return;
    persistUpdate({ events, running, total, runId, error });
  }, [events, running, total, runId, error, persistKey, persistUpdate]);

  const start = useCallback(async (pipelineId: string) => {
    setRunning(true);
    setEvents([]);
    setError(null);
    setTotal(null);
    try {
      // The server runs the sweep to completion and returns {run_id,total}.
      // We subscribe to its events BEFORE awaiting so we don't miss early rows.
      const res = await sweepRequest(pipelineId);
      setRunId(res.run_id);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  }, []);

  // Subscribe to the run's events once we have a run_id.
  useEffect(() => {
    if (!runId) return;

    const channel = sb
      .channel(`sweep-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "copilot_run_events",
          filter: `run_id=eq.${runId}`,
        },
        (payload: { new: RunEventRow }) => {
          const row = payload.new;
          const ev: HudEvent = {
            kind: row.kind,
            seq: row.seq,
            run_id: row.run_id,
            opportunity_id: row.opportunity_id,
            payload: row.payload,
          };
          setEvents((prev) => [...prev, ev]);
          if (ev.kind === "done") setRunning(false);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      sb.removeChannel(channel);
    };
  }, [runId]);

  return { events, running, total, error, start };
}
