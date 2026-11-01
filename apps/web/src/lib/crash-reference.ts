import { useSyncExternalStore } from 'react';

/**
 * The reference the server returned for the crash on screen, or `null`.
 *
 * A module-level store rather than React state because the report is sent from two places that
 * are not components (the router's `defaultOnCatch` and a class boundary's `componentDidCatch`)
 * and read by two that are. A fallback shows "This problem has been reported. Reference: …" ONLY
 * when this holds a value, so it never claims a report that did not arrive (spec Q3).
 */
let reference: string | null = null;
const listeners = new Set<() => void>();

export function setCrashReference(next: string | null): void {
  if (next === reference) return;
  reference = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCrashReference(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => reference,
    () => null,
  );
}
