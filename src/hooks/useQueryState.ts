import { useCallback, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}

export interface SortState {
  key: string | undefined;
  dir: "asc" | "desc" | null;
}

export interface QueryState {
  /** Map of filter key → current value (only non-default values). */
  activeFilters: Record<string, string>;
  /** Set a single filter. Pass "all" to reset it to the filter's default. */
  setFilter: (key: string, value: string) => void;
  /** Reset all filters and search to their defaults. */
  clearFilters: () => void;
  /** Current sort column and direction. */
  sort: SortState;
  /** Set sort explicitly. */
  setSort: (key: string, dir: "asc" | "desc" | null) => void;
  /**
   * Cycle sort on a column:
   *  - Different column → start ascending
   *  - Same column    → none → asc → desc → none
   */
  cycleSort: (key: string) => void;
  /** Free-text search string. */
  search: string;
  /** Set the search string. */
  setSearch: (value: string) => void;
  /** True when any filter or search has a non-default value. */
  hasActiveFilters: boolean;
  /** Number of active filters (including search as one). */
  activeFilterCount: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useQueryState(filters: FilterDef[]): QueryState {
  // Derive initial values from the filter definitions
  const initialFilters = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const f of filters) {
      map[f.key] = f.defaultValue ?? "all";
    }
    return map;
  }, [filters]);

  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters);
  const [sort, setSortState] = useState<SortState>({ key: undefined, dir: null });
  const [search, setSearch] = useState("");

  // ── Active filters (only non-default) ────────────────────────────────────
  const activeFilters = useMemo<Record<string, string>>(() => {
    const active: Record<string, string> = {};
    for (const f of filters) {
      const defaultValue = f.defaultValue ?? "all";
      const current = filterValues[f.key] ?? defaultValue;
      if (current !== defaultValue) {
        active[f.key] = current;
      }
    }
    return active;
  }, [filterValues, filters]);

  // ── Setters ──────────────────────────────────────────────────────────────
  const setFilter = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilterValues(initialFilters);
    setSearch("");
  }, [initialFilters]);

  const setSort = useCallback(
    (key: string, dir: "asc" | "desc" | null) => {
      setSortState({ key, dir });
    },
    [],
  );

  const cycleSort = useCallback((key: string) => {
    setSortState((prev) => {
      if (prev.key !== key) {
        // Different column → start ascending
        return { key, dir: "asc" };
      }
      // Same column: none → asc → desc → none
      switch (prev.dir) {
        case null:
          return { key, dir: "asc" };
        case "asc":
          return { key, dir: "desc" };
        case "desc":
          return { key: undefined, dir: null };
      }
    });
  }, []);

  // ── Derived booleans ─────────────────────────────────────────────────────
  const hasActiveFilters = useMemo(
    () => Object.keys(activeFilters).length > 0 || search.length > 0,
    [activeFilters, search],
  );

  const activeFilterCount = useMemo(
    () => Object.keys(activeFilters).length + (search.length > 0 ? 1 : 0),
    [activeFilters, search],
  );

  return {
    activeFilters,
    setFilter,
    clearFilters,
    sort,
    setSort,
    cycleSort,
    search,
    setSearch,
    hasActiveFilters,
    activeFilterCount,
  };
}
