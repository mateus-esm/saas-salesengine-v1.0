// Sprint 11 — debounce for Realtime-driven refetches.
//
// Every change to `leads` or `opportunities` used to refetch the whole list at
// once, and WhatsApp traffic touches `leads.last_message_at` all day. This groups
// a burst of changes into one refetch. `maxWait` guarantees a constant stream
// still refreshes the screen now and then instead of starving forever.

export interface Debouncer {
  call: () => void;
  cancel: () => void;
}

export function createDebouncer(
  fn: () => void,
  waitMs: number,
  opts: { maxWait?: number } = {},
): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstCallAt: number | null = null;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstCallAt = null;
    fn();
  };

  return {
    call() {
      const now = Date.now();
      if (firstCallAt === null) firstCallAt = now;
      if (opts.maxWait !== undefined && now - firstCallAt >= opts.maxWait) {
        fire();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, waitMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      firstCallAt = null;
    },
  };
}
