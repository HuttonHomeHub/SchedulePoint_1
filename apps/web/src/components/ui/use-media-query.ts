import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and return whether it currently matches, updating on change.
 * `fallback` is used when `matchMedia` is unavailable (SSR / jsdom) so callers can pick a sane
 * default (e.g. the desktop layout). Prefer CSS `md:`/`lg:` utilities for pure styling — reach
 * for this only when the query must change the rendered *structure* (ADR-0030 responsive split).
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
