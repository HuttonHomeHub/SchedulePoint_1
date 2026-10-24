import { useCallback } from 'react';

import { useDevicePref } from '@/hooks/use-device-pref';

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

function parsePrefs(raw: unknown): LegendPrefs {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<LegendPrefs>;
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

export function useLegendPanelPrefs(): UseLegendPanelPrefs {
  const [prefs, setPrefs] = useDevicePref<LegendPrefs>(STORAGE_KEY, parsePrefs, {
    open: false,
    position: null,
  });

  const toggle = useCallback(() => setPrefs((p) => ({ ...p, open: !p.open })), [setPrefs]);
  const close = useCallback(() => setPrefs((p) => ({ ...p, open: false })), [setPrefs]);
  const setPosition = useCallback(
    (position: LegendPanelPosition) => setPrefs((p) => ({ ...p, position })),
    [setPrefs],
  );

  return { open: prefs.open, position: prefs.position, toggle, close, setPosition };
}
