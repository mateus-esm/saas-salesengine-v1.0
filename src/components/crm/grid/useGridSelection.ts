import { useCallback, useMemo, useState } from "react";

// Sprint 15 · T9 — the selection is of rows on screen: an id that left the rows
// (a filter, a search, a delete elsewhere) is no longer selected, so a mass
// action never acts on a row the user cannot see. Paging only adds rows, so a
// selection made on page 1 survives loading page 2.
export function useGridSelection(allIds: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const idsKey = allIds.join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands for allIds
  const present = useMemo(() => new Set(allIds), [idsKey]);

  const selectedIds = useMemo(() => {
    const kept = [...picked].filter((id) => present.has(id));
    return kept.length === picked.size ? picked : new Set(kept);
  }, [picked, present]);

  const toggle = useCallback(
    (id: string) => {
      setPicked((prev) => {
        const next = new Set([...prev].filter((p) => present.has(p)));
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [present],
  );

  const toggleAll = useCallback(() => {
    setPicked((prev) => {
      const visible = [...prev].filter((id) => present.has(id)).length;
      return visible === present.size ? new Set() : new Set(present);
    });
  }, [present]);

  const clear = useCallback(() => {
    setPicked(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const count = selectedIds.size;

  return { selectedIds, isSelected, toggle, toggleAll, clear, count };
}
