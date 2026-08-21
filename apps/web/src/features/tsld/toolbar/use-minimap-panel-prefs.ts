import { useCallback, useEffect, useState } from 'react';

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

function readOpen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { open?: unknown };
      return parsed.open === true;
    }
  } catch {
    // Corrupt storage (or access denied) → the default (closed).
  }
  return false;
}

export function useMinimapPanelPrefs(): UseMinimapPanelPrefs {
  const [open, setOpen] = useState<boolean>(readOpen);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ open }));
    } catch {
      // Storage full or disabled — the preference simply won't persist.
    }
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
