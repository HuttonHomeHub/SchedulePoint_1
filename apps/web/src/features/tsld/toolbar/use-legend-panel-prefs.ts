import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted UI state for the on-canvas **floating Legend panel** (ADR-0031 amendment) — whether it is
 * open and where the planner has dragged it. Ephemeral view state (not server/URL state, per
 * ADR-0004), kept in `localStorage` so the legend stays where it was put across sessions; corrupt or
 * stale storage is ignored and reset to the default (closed, default corner). Position is stored as a
 * top-left pixel offset **within the canvas region**; it is re-clamped against the live region size at
 * render, so a shrunk viewport can never strand the panel off-screen.
 */
export interface LegendPanelPosition {
  x: number;
  y: number;
}

export interface UseLegendPanelPrefs {
  open: boolean;
  /** Committed drag position, or `null` to sit in the default corner. */
  position: LegendPanelPosition | null;
  toggle: () => void;
  close: () => void;
  setPosition: (position: LegendPanelPosition) => void;
}

interface LegendPrefs {
  open: boolean;
  position: LegendPanelPosition | null;
}

const STORAGE_KEY = 'schedulepoint-tsld-legend';

function readPrefs(): LegendPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LegendPrefs>;
      const p = parsed.position;
      const position =
        p &&
        typeof p.x === 'number' &&
        typeof p.y === 'number' &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y)
          ? { x: p.x, y: p.y }
          : null;
      return { open: parsed.open === true, position };
    }
  } catch {
    // Corrupt storage (or access denied) → fall back to the default (closed, default corner).
  }
  return { open: false, position: null };
}

export function useLegendPanelPrefs(): UseLegendPanelPrefs {
  const [prefs, setPrefs] = useState<LegendPrefs>(() =>
    typeof localStorage === 'undefined' ? { open: false, position: null } : readPrefs(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage full or disabled — the preference simply won't persist.
    }
  }, [prefs]);

  const toggle = useCallback(() => setPrefs((p) => ({ ...p, open: !p.open })), []);
  const close = useCallback(() => setPrefs((p) => ({ ...p, open: false })), []);
  const setPosition = useCallback(
    (position: LegendPanelPosition) => setPrefs((p) => ({ ...p, position })),
    [],
  );

  return { open: prefs.open, position: prefs.position, toggle, close, setPosition };
}
