import { useCallback, useState } from 'react';

/**
 * A **one-time visible hint**, persisted per-id so future one-time hints share the same storage
 * shape and cost no new `localStorage` key (feature-spec.md §4.2). Modelled on
 * {@link useLegendPanelPrefs}'s read/write pattern: corrupt or blocked storage **fails open** —
 * `unseen` stays `true` — since that is the more informative state for a disclosure hint, never
 * the reverse.
 *
 * Marking a hint seen is the caller's responsibility (`markSeen`), so **what** counts as "seen"
 * stays a per-hint decision (e.g. the first successful pick, not the first open) rather than
 * something this hook has to guess at.
 */
export interface UseFirstUseHint {
  unseen: boolean;
  markSeen: () => void;
}

const STORAGE_KEY = 'schedulepoint-hints';

function readSeen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
    }
  } catch {
    // Corrupt storage (or access denied) — fail open: every hint reads as unseen.
  }
  return {};
}

export function useFirstUseHint(key: string): UseFirstUseHint {
  const [seen, setSeen] = useState(() => readSeen()[key] === true);

  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      const all = readSeen();
      all[key] = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Storage full or disabled — the preference simply won't persist across reloads.
    }
  }, [key]);

  return { unseen: !seen, markSeen };
}
