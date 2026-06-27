import { useCallback, useEffect, useRef, useState } from "react";

export const DRAFT_PREFIX = "draft_";

/** Load a draft from localStorage. Returns null if absent or corrupt. */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable
  }
}

function clearDraft(key: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // localStorage unavailable
  }
}

/**
 * useDraftAutosave — auto-save form state to localStorage so in-progress
 * input survives navigation / reload.
 *
 * @param key     Unique storage key (e.g. `revenue_goals_${pipelineId}`).
 *                Prepended with `draft_` internally.
 * @param initial Default (or seeded-from-query) value when no draft exists.
 *
 * On mount, checks localStorage for an existing draft and uses it as the
 * initial value if found — so navigating away and back restores unsaved
 * edits without the user having to do anything.
 *
 * Use `commit()` after a successful API save to clear the draft, and
 * `discard()` to discard without saving.
 */
export function useDraftAutosave<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    return loadDraft<T>(key) ?? initial;
  });

  // Keep a ref to the latest initial so commit/discard always reset to
  // what the caller considers the current "saved" baseline (e.g. after
  // React Query re-fetch).
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // Has a draft ever existed on mount? Stable across renders.
  const [hasDraft] = useState(() => loadDraft(key) !== null);

  // Debounced auto-save: writes to localStorage 1 s after the last change.
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(key, value), 1000);
    return () => clearTimeout(timer);
  }, [key, value]);

  // Derived dirty flag: current value != the last committed initial.
  // Uses JSON.stringify for deep comparison; fine for serializable form state.
  const isDirty = value !== initial && JSON.stringify(value) !== JSON.stringify(initial);

  /** Call after a successful API save — clears the draft and resets to `initial`. */
  const commit = useCallback(() => {
    clearDraft(key);
    setValue(initialRef.current);
  }, [key]);

  /** Discard the draft and reset to `initial` without saving. */
  const discard = useCallback(() => {
    clearDraft(key);
    setValue(initialRef.current);
  }, [key]);

  return { value, setValue, commit, discard, hasDraft, isDirty } as const;
}
