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
  /**
   * A **viewport-dependent upper limit** tighter than `max`, for a panel that must leave something
   * else a minimum of room. It bounds the size READ BACK and the sizes a drag or key can set, and it
   * never touches what is stored: the stored value is the planner's preference, and a window that is
   * briefly narrow must not shrink it for good (the same argument as the bound-follow case below).
   * Never taken below `min`.
   */
  ceiling?: number;
  /**
   * **When the preference is written to storage.** `'mount'` (the default, and what every panel
   * but one has always done) writes the state as soon as the hook mounts, so the first opening
   * stores the seed. `'on-change'` writes nothing until the person places the panel — `setSize`,
   * `collapse` or `expand` — and until a **size** is placed the panel **follows `defaultSize` live**
   * (a collapse or expand stores the flag alone and never the seed), which may change
   * from one opening to the next. It exists for a panel whose seed depends on something else the
   * person can change (the Gantt's pane follows which columns open), where a stored seed is
   * indistinguishable from a divider somebody placed and would freeze the old answer for ever.
   * `resetSize` then removes the stored value and returns to unplaced.
   */
  persist?: 'mount' | 'on-change';
}

export interface UseResizablePanelPrefs {
  collapsed: boolean;
  size: number;
  /** The largest size the panel may take right now: `max`, or the `ceiling` when that is tighter. */
  limit: number;
  collapse: () => void;
  expand: () => void;
  setSize: (size: number) => void;
  /**
   * Put the size back on `defaultSize`, **without clamping against this render's bounds**. For a
   * caller whose bounds are about to change in the same gesture (the Gantt's Reset widths lowers its
   * floor as it clears the widths that raised it): `setSize(defaultSize)` would clamp the default up
   * to the stale floor and store that. The size read back is still clamped to the bounds then current.
   */
  resetSize: () => void;
}

interface PanelPrefs {
  collapsed: boolean;
  /** `null` only under `persist: 'on-change'`, while nothing has been placed: the panel reads `defaultSize`. */
  size: number | null;
  /** Whether the person has changed anything since mount, which is what earns a write. Always true under `'mount'`. */
  placed: boolean;
}

/** Clamp a candidate size to `[min, max]` and round to whole px. */
export function clampSize(size: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(size)));
}

function readPrefs({
  storageKey,
  min,
  max,
  defaultSize,
  persist,
}: ResizablePanelOptions): PanelPrefs {
  const onChange = persist === 'on-change';
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ collapsed: boolean; size: number }>;
      return {
        collapsed: parsed.collapsed === true,
        size:
          typeof parsed.size === 'number' && Number.isFinite(parsed.size)
            ? clampSize(parsed.size, min, max)
            : onChange
              ? null
              : defaultSize,
        placed: !onChange,
      };
    }
  } catch {
    // Corrupt storage (or access denied) → fall back to defaults.
  }
  return { collapsed: false, size: onChange ? null : defaultSize, placed: !onChange };
}

export function useResizablePanelPrefs(options: ResizablePanelOptions): UseResizablePanelPrefs {
  const { storageKey, min, max, defaultSize, ceiling, persist = 'mount' } = options;
  const limit = Math.max(min, Math.min(max, ceiling ?? max));
  const [prefs, setPrefs] = useState<PanelPrefs>(() => readPrefs(options));

  useEffect(() => {
    // Under 'on-change' an unplaced panel stores nothing: the seed is not a choice.
    if (!prefs.placed) return;
    try {
      localStorage.setItem(
        storageKey,
        // A collapse placed before any drag stores no size: writing the seed here would freeze it as
        // a width somebody chose, and the pane would stop following `defaultSize`.
        JSON.stringify(
          prefs.size === null
            ? { collapsed: prefs.collapsed }
            : { collapsed: prefs.collapsed, size: prefs.size },
        ),
      );
    } catch {
      // Storage full or disabled — the preference simply won't persist.
    }
  }, [storageKey, prefs]);

  const collapse = useCallback(
    () => setPrefs((p) => ({ ...p, collapsed: true, placed: true })),
    [],
  );
  const expand = useCallback(() => setPrefs((p) => ({ ...p, collapsed: false, placed: true })), []);
  const setSize = useCallback(
    (size: number) => setPrefs((p) => ({ ...p, size: clampSize(size, min, limit), placed: true })),
    [min, limit],
  );

  const resetSize = useCallback(() => {
    if (persist === 'on-change') {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Storage disabled — there is nothing stored to remove.
      }
      setPrefs((p) => ({ ...p, size: null, placed: false }));
      return;
    }
    setPrefs((p) => ({ ...p, size: defaultSize }));
  }, [defaultSize, persist, storageKey]);

  /**
   * **Clamped on the way OUT, not only on the way in.**
   *
   * `readPrefs` clamps once, inside the `useState` initialiser, so a `min`/`max` that changes
   * later never reaches a size already in state — and a bound CAN change while a panel is mounted.
   * The Gantt's grid floor is derived from what the pinned block currently needs, so capturing a
   * baseline raises it by the width of the `Start vs baseline` column; a planner who had dragged the
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
    size: clampSize(prefs.size ?? defaultSize, min, limit),
    limit,
    collapse,
    expand,
    setSize,
    resetSize,
  };
}
