// src/hooks/__tests__/useSyncJobPersistence.test.ts
//
// Tests for the useSyncJobPersistence hook — localStorage persistence for
// sync job state, following the same pattern as useDraftAutosave.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSyncJobPersistence,
  SYNC_PREFIX,
  type SyncJobState,
} from "../useSyncJobPersistence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function persisted(key: string): SyncJobState | null {
  try {
    const raw = localStorage.getItem(SYNC_PREFIX + key);
    return raw ? (JSON.parse(raw) as SyncJobState) : null;
  } catch {
    return null;
  }
}

function persist(key: string, state: SyncJobState): void {
  localStorage.setItem(SYNC_PREFIX + key, JSON.stringify(state));
}

function clearPersisted(key: string): void {
  localStorage.removeItem(SYNC_PREFIX + key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSyncJobPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Mount / restore ────────────────────────────────────────────────────

  it("returns empty state when nothing is persisted", () => {
    const { result } = renderHook(() => useSyncJobPersistence("test_key"));
    expect(result.current.state).toEqual({
      events: [],
      running: false,
      runId: null,
      total: null,
      error: null,
      updatedAt: expect.any(String),
    });
    expect(result.current.hasPersisted).toBe(false);
  });

  it("restores persisted state on mount", () => {
    const saved: SyncJobState = {
      events: [
        {
          kind: "move_stage",
          seq: 1,
          run_id: "run-1",
          opportunity_id: "opp-1",
          payload: {},
        },
      ],
      running: false,
      runId: "run-1",
      total: 5,
      error: null,
      updatedAt: "2026-06-27T12:00:00.000Z",
    };
    persist("test_key", saved);

    const { result } = renderHook(() => useSyncJobPersistence("test_key"));
    expect(result.current.state).toEqual(saved);
    expect(result.current.hasPersisted).toBe(true);
  });

  it("returns empty state when localStorage has corrupt JSON", () => {
    localStorage.setItem(SYNC_PREFIX + "corrupt", "not-json");
    const { result } = renderHook(() =>
      useSyncJobPersistence("corrupt"),
    );
    expect(result.current.state.events).toEqual([]);
    expect(result.current.state.running).toBe(false);
    expect(result.current.hasPersisted).toBe(false);
  });

  // ── Persist on update ──────────────────────────────────────────────────

  it("persists to localStorage when updateState is called", () => {
    const { result } = renderHook(() => useSyncJobPersistence("test_key"));

    act(() => {
      result.current.updateState({ events: [], running: true });
    });

    const stored = persisted("test_key");
    expect(stored).not.toBeNull();
    expect(stored!.running).toBe(true);
    expect(stored!.events).toEqual([]);
    expect(stored!.updatedAt).toEqual(expect.any(String));
  });

  it("merges partial updates with existing state", () => {
    const saved: SyncJobState = {
      events: [{ kind: "move_stage", seq: 1, payload: {} }],
      running: true,
      runId: "run-1",
      total: null,
      error: null,
      updatedAt: "2026-06-27T12:00:00.000Z",
    };
    persist("test_key", saved);

    const { result } = renderHook(() => useSyncJobPersistence("test_key"));

    act(() => {
      // Add a second event and mark done
      result.current.updateState({
        events: [
          ...result.current.state.events,
          { kind: "done", seq: 2, payload: {} },
        ],
        running: false,
      });
    });

    const stored = persisted("test_key");
    expect(stored!.events).toHaveLength(2);
    expect(stored!.running).toBe(false);
    expect(stored!.runId).toBe("run-1"); // preserved from original
  });

  // ── Clear ──────────────────────────────────────────────────────────────

  it("clears persisted state from localStorage", () => {
    persist("test_key", {
      events: [{ kind: "done", seq: 1, payload: {} }],
      running: false,
      runId: "run-1",
      total: 3,
      error: null,
      updatedAt: "2026-06-27T12:00:00.000Z",
    });

    const { result } = renderHook(() => useSyncJobPersistence("test_key"));

    act(() => {
      result.current.clear();
    });

    expect(localStorage.getItem(SYNC_PREFIX + "test_key")).toBeNull();
    // In-memory state is also reset
    expect(result.current.state.events).toEqual([]);
    expect(result.current.state.running).toBe(false);
    expect(result.current.state.runId).toBeNull();
  });

  // ── Multiple keys are isolated ─────────────────────────────────────────

  it("isolates state by key", () => {
    const { result: hookA } = renderHook(() =>
      useSyncJobPersistence("key_a"),
    );
    const { result: hookB } = renderHook(() =>
      useSyncJobPersistence("key_b"),
    );

    act(() => {
      hookA.current.updateState({ running: true });
    });

    expect(persisted("key_a")!.running).toBe(true);
    expect(persisted("key_b")).toBeNull();
    expect(hookB.current.state.running).toBe(false);
  });

  // ── localStorage full (error handling) ─────────────────────────────────

  it("does not throw when localStorage.setItem throws", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    const { result } = renderHook(() => useSyncJobPersistence("test_key"));

    expect(() => {
      act(() => {
        result.current.updateState({ running: true });
      });
    }).not.toThrow();

    setItemSpy.mockRestore();
  });
});
