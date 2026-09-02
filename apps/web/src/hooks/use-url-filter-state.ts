import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { searchString } from '@/lib/router/search-string';

/**
 * Typed, reload-safe **filter state in the URL** for a list screen (`docs/UX_STANDARDS.md`
 * "Deep-linkable everything: filters, tabs, and pagination live in the URL";
 * `docs/FRONTEND_ARCHITECTURE.md` "filters/pagination/sort live in typed search params").
 *
 * A library screen's search term and filters are exactly the state a planner wants to keep across
 * a reload and paste to a colleague ("here are the archived calendars I mean"), so they belong in
 * the router, not in `useState`.
 *
 * Two deliberate behaviours:
 * - **Defaults are omitted from the URL.** A value equal to its default is deleted from the search
 *   params rather than serialised, so the untouched screen keeps its clean `/…/calendars` URL and
 *   "is anything filtered?" is answerable by looking at it.
 * - **`replace: true`.** Typing in a search box must not push a history entry per keystroke; Back
 *   should leave the screen, not walk the term backwards one character at a time.
 *
 * It must be called from a component rendered inside the router (a route screen). Components that
 * are also mounted outside one — every table in this app is rendered directly by its unit tests —
 * take the resulting value/setter as props instead (the controlled/uncontrolled idiom), which is
 * why this hook lives here and not inside the tables.
 */
export function useUrlFilterState<T extends Record<string, string>>(
  defaults: T,
  parse: (raw: Record<string, unknown>) => T,
): [T, (patch: Partial<T>) => void] {
  const raw: Record<string, unknown> = useSearch({ strict: false });
  const navigate = useNavigate();

  const value = useMemo(() => parse(raw), [raw, parse]);

  const setValue = useCallback(
    (patch: Partial<T>): void => {
      const next = { ...value, ...patch };
      void navigate({
        to: '.',
        search: (prev: Record<string, string | undefined>) => {
          const out: Record<string, string | undefined> = { ...prev };
          for (const key of Object.keys(next)) {
            const candidate = next[key];
            if (candidate === undefined || candidate === '' || candidate === defaults[key]) {
              delete out[key];
            } else {
              out[key] = candidate;
            }
          }
          return out;
        },
        replace: true,
      });
    },
    [value, navigate, defaults],
  );

  return [value, setValue];
}

/**
 * Read one string search param, falling back to `fallback` unless the raw value is one of
 * `allowed`. Unknown/garbage values in a hand-edited URL degrade to the default rather than
 * throwing — a filter is not worth a crashed screen.
 */
export function pickParam<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = searchString(raw[key]);
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Read one free-text search param (trimmed of nothing — the user's spacing is theirs).
 *
 * **This is the one reader #96 M1 changes behaviour for**, and it is the point of the milestone:
 * `?q=2026` decodes to the NUMBER `2026`, so the old `typeof === 'string'` test discarded a real
 * search term and showed an unfiltered table with an empty search box. Its siblings above coerce
 * too, but for them it is a no-op — no enum vocabulary in this app has a JSON-parseable member, so
 * a coerced value still fails `allowed` and still falls back.
 */
export function pickText(raw: Record<string, unknown>, key: string): string {
  return searchString(raw[key]) ?? '';
}
