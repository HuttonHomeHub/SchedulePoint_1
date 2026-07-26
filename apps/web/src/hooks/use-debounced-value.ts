import { useEffect, useState } from 'react';

/**
 * Default settle time for a type-ahead field (ms). Long enough that a normal typing burst produces
 * ONE request, short enough that the list still feels live — the value the library search boxes and
 * the picker comboboxes share (ADR-0053 §4 / US-8).
 */
export const DEFAULT_DEBOUNCE_MS = 250;

/**
 * The trailing-debounced echo of a rapidly-changing value: it follows `value` only once `value` has
 * stopped changing for `delayMs`.
 *
 * Used to keep a **server-backed** search honest — the input stays instantly responsive (it renders
 * the raw state), while the query key / request URL is driven by this settled value, so a burst of
 * keystrokes costs one request rather than one per character. Do **not** reach for it in front of a
 * purely client-side filter: there the delay buys nothing and only makes the list feel laggy.
 *
 * A generic value (not just a string) so it also debounces a whole filter object; equality is
 * reference equality, so memoise an object you pass in.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Every change restarts the timer, so only the last value in a burst is ever committed.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
