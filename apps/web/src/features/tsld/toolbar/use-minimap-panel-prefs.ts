import { useCallback } from 'react';

import { useDevicePref } from '@/hooks/use-device-pref';

/**
 * Persisted UI state for the **minimap panel** (ADR-0100, minimap M2-T3) — open or not.
 * Ephemeral view state (not server/URL state, ADR-0004), kept in `localStorage` so the panel
 * survives a reload; **global, not per-plan, and deliberately not in the URL** — ADR-0095's
 * Gantt memory earned the URL because sort and columns change what the reader is *looking
 * at*; minimap visibility is a workstation preference, and a link forcing the recipient's
 * minimap open is noise. Default **off** (product owner Q1). Corrupt or blocked storage
 * falls back to the default — the `use-legend-panel-prefs` shape, including the try/catch.
 */
export interface UseMinimapPanelPrefs {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const STORAGE_KEY = 'schedulepoint-tsld-minimap';

interface MinimapPrefs {
  open: boolean;
}

// A non-boolean `open` is closed rather than truthy.
function parsePrefs(raw: unknown): MinimapPrefs {
  const open = typeof raw === 'object' && raw !== null && (raw as { open?: unknown }).open === true;
  return { open };
}

export function useMinimapPanelPrefs(): UseMinimapPanelPrefs {
  const [prefs, setPrefs] = useDevicePref(STORAGE_KEY, parsePrefs, { open: false });

  const toggle = useCallback(() => setPrefs((p) => ({ open: !p.open })), [setPrefs]);
  const close = useCallback(() => setPrefs({ open: false }), [setPrefs]);
  return { open: prefs.open, toggle, close };
}
