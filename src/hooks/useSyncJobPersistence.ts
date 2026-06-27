// src/hooks/useSyncJobPersistence.ts
//
// Sprint 6.10 · W2 — Sync job state persistence layer.
//
// Reuses the same localStorage pattern as useDraftAutosave (W1) but for
// sync/sweep job state: events, running flag, runId, total, error.
// Allows sync state to survive navigation and page reload.

import { useCallback, useEffect, useRef, useState } from "react";
import type { HudEvent } from "./useCopilotSync";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncJobState {
  events: HudEvent[];
  running: boolean;
  runId: string | null;
  total: number | null;
  error: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Storage helpers (mirror useDraftAutosave's pattern)
// ---------------------------------------------------------------------------

export const SYNC_PREFIX = "sync_job_";

function loadSyncJob(key: string): SyncJobState | null {
  try {
    const raw = localStorage.getItem(SYNC_PREFIX + key);
    return raw ? (JSON.parse(raw) as SyncJobState) : null;
  } catch {
    return null;
  }
}

function saveSyncJob(key: string, state: SyncJobState): void {
  try {
    localStorage.setItem(SYNC_PREFIX + key, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function removeSyncJob(key: string): void {
  try {
    localStorage.removeItem(SYNC_PREFIX + key);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

function defaultState(): SyncJobState {
  return {
    events: [],
    running: false,
    runId: null,
    total: null,
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useSyncJobPersistence — persists sync job state to localStorage so
 * copilot sync/sweep state survives navigation and page reload.
 *
 * @param key  Optional storage key (e.g. `sweep_${pipelineId}`).
 *             When omitted the hook is a no-op (empty state, no I/O).
 *
 * On mount, restores previously persisted state if available.
 * `updateState()` writes to localStorage immediately (not debounced —
 * sync events are low-frequency enough that debouncing is unnecessary).
 * `clear()` removes the entry from localStorage and resets in-memory state.
 *
 * Follows the same pattern as `useDraftAutosave` (W1) but stores the full
 * SyncJobState object rather than arbitrary form data.
 */
export function useSyncJobPersistence(
  key: string | undefined,
) {
  // Load once on mount; both `state` and `hasPersisted` initializers
  // read from this shared value, avoiding a redundant localStorage call.
  const [initial] = useState(() => {
    if (!key) return { state: defaultState(), hasPersisted: false } as const;
    const loaded = loadSyncJob(key);
    if (loaded) return { state: loaded, hasPersisted: true } as const;
    return { state: defaultState(), hasPersisted: false } as const;
  });

  const [state, setState] = useState<SyncJobState>(initial.state);
  const [hasPersisted] = useState(initial.hasPersisted);

  // Ref to detect first mount: we want to skip the first persist effect
  // since the state was just loaded from localStorage (writing it back
  // immediately is unnecessary but harmless — we skip for clarity).
  const isFirstRender = useRef(true);
  const prevKeyRef = useRef(key);
  // When true, the next persist effect should be a no-op (used by clear()).
  const skipNextPersist = useRef(false);

  // Persist on any state change, skipping the initial load-back write.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!key) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    saveSyncJob(key, { ...state, updatedAt: new Date().toISOString() });
  }, [key, state]);

  // When key changes (e.g. navigating to a different lead), reload state.
  useEffect(() => {
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    if (!key) {
      setState(defaultState());
      return;
    }
    const saved = loadSyncJob(key);
    setState(saved ?? defaultState());
  }, [key]);

  const updateState = useCallback(
    (partial: Partial<SyncJobState>) => {
      setState((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  const clear = useCallback(() => {
    if (key) removeSyncJob(key);
    skipNextPersist.current = true;
    setState(defaultState());
  }, [key]);

  return { state, updateState, clear, hasPersisted } as const;
}
