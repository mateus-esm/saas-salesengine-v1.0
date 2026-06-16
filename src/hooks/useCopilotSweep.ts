// src/hooks/useCopilotSweep.ts
//
// Sprint 6.1 · EPIC D · D5 — Global Sweep trigger + Realtime HUD consumer.
//
// sweep() POSTs /api/v1/sync/sweep and gets back a run_id. We then subscribe to
// copilot_run_events filtered by that run_id (Supabase Realtime, mirroring
// useCopilotRealtime) and feed the same HudEvent[] shape the D4 modal renders,
// so the sweep reuses the single TelemetryHUD.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweep as sweepRequest } from "@/services/copilot";
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

export function useCopilotSweep() {
  const [events, setEvents] = useState<HudEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const channelRef = useRef<unknown>(null);

  const start = useCallback(async (pipelineId: string) => {
    setEvents([]);
    setError(null);
    setTotal(null);
    setRunning(true);
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
      .channel(`copilot_sweep_${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "copilot_run_events",
          filter: `run_id=eq.${runId}`,
        },
        (msg: { new: RunEventRow }) => {
          const row = msg.new;
          const ev: HudEvent = {
            kind: row.kind,
            seq: row.seq,
            run_id: row.run_id,
            opportunity_id: row.opportunity_id,
            payload: row.payload ?? {},
          };
          setEvents((prev) => [...prev, ev]);
          if (row.kind === "done") setRunning(false);
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      sb.removeChannel(channel);
      channelRef.current = null;
    };
  }, [runId]);

  return { events, running, total, error, runId, start };
}
