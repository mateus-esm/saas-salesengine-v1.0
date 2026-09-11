// Sprint 11 · Onda 2 · T17 — the filter bars read and write the URL.
//
// The Kanban and the Leads table share the deal filters (switching view keeps
// them); the contact base has its own. Typing in the search box replaces the
// history entry (no history full of half-typed names); every other filter
// pushes one, so "back" undoes the last filter.

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  contactFiltersToParams,
  crmFiltersToParams,
  paramToSort,
  paramsToContactFilters,
  paramsToCrmFilters,
  sortToParam,
} from "@/lib/crmFilterParams";
import type { ContactFilters, CrmFilters, CrmSort } from "@/types/crmFilters";

export interface SetFilterOptions {
  /** true for keystrokes (search): replace the history entry instead of pushing one. */
  replace?: boolean;
}

function useSortParam() {
  const [params, setParams] = useSearchParams();
  const sort = useMemo(() => paramToSort(params.get("ordem")), [params]);
  const setSort = useCallback(
    (next: CrmSort | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const value = sortToParam(next);
          if (value) p.set("ordem", value);
          else p.delete("ordem");
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { sort, setSort };
}

export function useDealUrlFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => paramsToCrmFilters(params), [params]);
  const setFilters = useCallback(
    (next: CrmFilters, opts?: SetFilterOptions) =>
      setParams((prev) => crmFiltersToParams(next, new URLSearchParams(prev)), { replace: opts?.replace ?? false }),
    [setParams],
  );
  const { sort, setSort } = useSortParam();
  return { filters, setFilters, sort, setSort };
}

export function useContactUrlFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => paramsToContactFilters(params), [params]);
  const setFilters = useCallback(
    (next: ContactFilters, opts?: SetFilterOptions) =>
      setParams((prev) => contactFiltersToParams(next, new URLSearchParams(prev)), { replace: opts?.replace ?? false }),
    [setParams],
  );
  const { sort, setSort } = useSortParam();
  return { filters, setFilters, sort, setSort };
}
