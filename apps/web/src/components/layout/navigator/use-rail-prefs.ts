import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted, per-user preferences for the pinned navigator rail (`lg`+): whether it
 * is collapsed and its width. This is ephemeral view state (not server or URL state,
 * per ADR-0029/ADR-0004), kept in `localStorage`. Corrupt/stale storage is ignored
 * and reset to defaults — it is a convenience, never relied on for correctness.
 */
const STORAGE_KEY = 'schedulepoint-nav-rail';

export const RAIL_MIN_WIDTH = 220;
export const RAIL_MAX_WIDTH = 480;
export const RAIL_DEFAULT_WIDTH = 288;

interface RailPrefs {
  collapsed: boolean;
  width: number;
}

/** Clamp a candidate rail width to the allowed range (also rounds to whole px). */
export function clampRailWidth(width: number): number {
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(width)));
}

function readPrefs(): RailPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RailPrefs>;
      return {
        collapsed: parsed.collapsed === true,
        width:
          typeof parsed.width === 'number' && Number.isFinite(parsed.width)
            ? clampRailWidth(parsed.width)
            : RAIL_DEFAULT_WIDTH,
      };
    }
  } catch {
    // Corrupt storage (or access denied) → fall back to defaults.
  }
  return { collapsed: false, width: RAIL_DEFAULT_WIDTH };
}

export interface UseRailPrefs {
  collapsed: boolean;
  width: number;
  collapse: () => void;
  expand: () => void;
  setWidth: (width: number) => void;
}

export function useRailPrefs(): UseRailPrefs {
  const [prefs, setPrefs] = useState<RailPrefs>(readPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage full or disabled — the preference simply won't persist.
    }
  }, [prefs]);

  const collapse = useCallback(() => setPrefs((p) => ({ ...p, collapsed: true })), []);
  const expand = useCallback(() => setPrefs((p) => ({ ...p, collapsed: false })), []);
  const setWidth = useCallback(
    (width: number) => setPrefs((p) => ({ ...p, width: clampRailWidth(width) })),
    [],
  );

  return { collapsed: prefs.collapsed, width: prefs.width, collapse, expand, setWidth };
}
