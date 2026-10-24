import { useEffect, useState } from 'react';

/**
 * A device preference: view state kept in `localStorage`, not on the server and not in the URL
 * (ADR-0004). The minimap panel, the legend panel and (from M2-T9) the swimlane gutter's collapsed
 * strip share this shape, which is why it is one hook rather than a third copy of the try/catch.
 *
 * `parse` receives whatever `JSON.parse` produced (or nothing usable) and must return a valid
 * `T`, so a corrupt, stale or hand-edited payload degrades to the caller's own default instead
 * of leaking a malformed value into render. Blocked or corrupt storage falls back to `fallback`
 * and a failed write simply leaves the preference unpersisted.
 */
export function useDevicePref<T>(
  key: string,
  parse: (raw: unknown) => T,
  fallback: T,
): readonly [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return parse(JSON.parse(raw));
    } catch {
      // Corrupt storage (or access denied) → the default.
    }
    return fallback;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or disabled — the preference simply won't persist.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
