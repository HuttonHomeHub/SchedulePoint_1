import { useCallback, useEffect, useState } from 'react';

/**
 * The navigator's **expansion set** — which client/project nodes are open. This is
 * ephemeral view state (not URL or server state, per ADR-0029/ADR-0004): the URL owns
 * *selection*; expansion is a convenience persisted **per-org** in `sessionStorage`.
 * Corrupt/stale storage is ignored (never trusted for correctness). Deep-links always
 * reveal the selected path regardless, via {@link UseExpansionState.expandPath}.
 */
const KEY_PREFIX = 'schedulepoint-nav-expanded:';

function keyFor(orgSlug: string): string {
  return `${KEY_PREFIX}${orgSlug}`;
}

function readExpanded(orgSlug: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(keyFor(orgSlug));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((value): value is string => typeof value === 'string'));
      }
    }
  } catch {
    // Corrupt storage → start empty.
  }
  return new Set();
}

export interface UseExpansionState {
  expanded: ReadonlySet<string>;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
  /** Add every id in a path (deep-link ancestor reveal); a no-op if all already open. */
  expandPath: (ids: string[]) => void;
}

export function useExpansionState(orgSlug: string): UseExpansionState {
  const [state, setState] = useState(() => ({ org: orgSlug, expanded: readExpanded(orgSlug) }));

  // Each org has its own expansion. The persistent shell keeps this hook mounted across
  // org switches, so reset per-org state *during render* when the active org changes
  // (React's "adjust state on a changing prop" pattern — no effect, no wasted render).
  if (state.org !== orgSlug) {
    setState({ org: orgSlug, expanded: readExpanded(orgSlug) });
  }
  const expanded = state.expanded;
  const setExpanded = useCallback(
    (updater: (prev: Set<string>) => Set<string>) =>
      setState((prev) => ({ org: prev.org, expanded: updater(prev.expanded) })),
    [],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(keyFor(orgSlug), JSON.stringify([...expanded]));
    } catch {
      // Storage full/disabled — expansion just won't persist.
    }
  }, [orgSlug, expanded]);

  const toggle = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setExpanded],
  );

  const expand = useCallback(
    (id: string) => {
      setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    },
    [setExpanded],
  );

  const collapse = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [setExpanded],
  );

  const expandPath = useCallback(
    (ids: string[]) => {
      setExpanded((prev) => {
        if (ids.every((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    },
    [setExpanded],
  );

  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded]);

  return { expanded, isExpanded, toggle, expand, collapse, expandPath };
}
