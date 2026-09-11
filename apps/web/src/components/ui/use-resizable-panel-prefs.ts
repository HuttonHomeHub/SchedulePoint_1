import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted, per-user preferences for a resizable/collapsible panel — whether it is collapsed
 * and its size (px). Ephemeral view state (not server/URL state, per ADR-0004), kept in
 * `localStorage`; corrupt/stale storage is ignored and reset to defaults (a convenience, never
 * relied on for correctness).
 *
 * **The single implementation behind every resizable panel in the product**, whichever axis it
 * splits on — a vertical splitter persists a width, a horizontal one a height — so they share one
 * clamp/persist/reset behaviour (ADR-0029 / ADR-0030). Each panel wraps it in a thin adapter that
 * owns only its storage key and bounds.
 *
 * **It deliberately does not name its consumers, and that is the correction rather than the
 * style.** This said "both the Project Explorer rail and the plan workspace's activity panel"
 * until 2026-09-11, seven consumers later — so a reader costing a change from it (a debounce, say)
 * was costing it against two panels instead of seven. `docs/TECH_DEBT.md` #149 records the same
 * drift one level out, and its own correction to "nine" was wrong in the other direction: nine
 * claimed, eight named, and one of those eight — the legend — only mentions this hook in a comment
 * and never calls it. A roster in a shared primitive goes stale every time somebody adds a panel
 * (ADR-0073 C4's rule: state the rule, not the inventory), so this one states the rule and a
 * reader who needs the count derives it.
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

  /**
   * **Clamped on the way OUT, not only on the way in.**
   *
   * `readPrefs` clamps once, inside the `useState` initialiser, so a `min`/`max` that changes
   * later never reaches a size already in state — and a bound CAN change while a panel is mounted.
   * The Gantt's grid floor is derived from what the pinned block currently needs, so capturing a
   * baseline raises it by the width of the `vs baseline` column; a planner who had dragged the
   * divider narrow was then left below a floor the component believed it was enforcing, and the
   * column painted on top of the chart (`docs/TECH_DEBT.md` #151, found in a browser). The other
   * two consumers pass constant bounds, so for them this is a no-op.
   *
   * **The STORED value is deliberately left alone.** It is the planner's preference; this is the
   * usable size under today's bounds. Persisting the clamp instead would quietly discard a width
   * they chose, and it would not come back when the baseline is deactivated and the floor drops —
   * a panel that shrinks permanently because something unrelated happened once.
   */
  return {
    collapsed: prefs.collapsed,
    size: clampSize(prefs.size, min, max),
    collapse,
    expand,
    setSize,
  };
}
