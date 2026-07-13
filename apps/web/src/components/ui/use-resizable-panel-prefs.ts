import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted, per-user preferences for a resizable/collapsible panel — whether it is collapsed
 * and its size (px). Ephemeral view state (not server/URL state, per ADR-0004), kept in
 * `localStorage`; corrupt/stale storage is ignored and reset to defaults (a convenience, never
 * relied on for correctness).
 *
 * The single implementation behind both the Project Explorer rail (vertical splitter → width)
 * and the plan workspace's activity panel (horizontal splitter → height), so the two share one
 * clamp/persist/reset behaviour (ADR-0029 / ADR-0030).
 */
export interface ResizablePanelOptions {
  /** `localStorage` key namespacing this panel's preference. */
  storageKey: string;
  min: number;
  max: number;
  defaultSize: number;
}

export interface UseResizablePanelPrefs {
  collapsed: boolean;
  size: number;
  collapse: () => void;
  expand: () => void;
  setSize: (size: number) => void;
}

interface PanelPrefs {
  collapsed: boolean;
  size: number;
}

/** Clamp a candidate size to `[min, max]` and round to whole px. */
export function clampSize(size: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(size)));
}

function readPrefs({ storageKey, min, max, defaultSize }: ResizablePanelOptions): PanelPrefs {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
      return {
        collapsed: parsed.collapsed === true,
        size:
          typeof parsed.size === 'number' && Number.isFinite(parsed.size)
            ? clampSize(parsed.size, min, max)
            : defaultSize,
      };
    }
  } catch {
    // Corrupt storage (or access denied) → fall back to defaults.
  }
  return { collapsed: false, size: defaultSize };
}

export function useResizablePanelPrefs(options: ResizablePanelOptions): UseResizablePanelPrefs {
  const { storageKey, min, max } = options;
  const [prefs, setPrefs] = useState<PanelPrefs>(() => readPrefs(options));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      // Storage full or disabled — the preference simply won't persist.
    }
  }, [storageKey, prefs]);

  const collapse = useCallback(() => setPrefs((p) => ({ ...p, collapsed: true })), []);
  const expand = useCallback(() => setPrefs((p) => ({ ...p, collapsed: false })), []);
  const setSize = useCallback(
    (size: number) => setPrefs((p) => ({ ...p, size: clampSize(size, min, max) })),
    [min, max],
  );

  return { collapsed: prefs.collapsed, size: prefs.size, collapse, expand, setSize };
}
