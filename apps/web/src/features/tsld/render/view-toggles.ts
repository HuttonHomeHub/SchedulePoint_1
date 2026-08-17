/**
 * Which optional canvas layers draw, and their defaults (ADR-0078 S2).
 *
 * Its own module for the ordering reason ADR-0078 §3a records — `paint-frame.ts` resolves
 * `scene.view ?? DEFAULT_VIEW_TOGGLES` once per frame and `paint.ts` re-exports both names, so
 * leaving them in `paint.ts` would be a cycle at the foundation of the decomposition. Moved
 * verbatim: every consumer still imports from `paint.ts`.
 */

export interface TsldViewToggles {
  dayGrid: boolean;
  monthGrid: boolean;
  yearGrid: boolean;
  today: boolean;
  nonWorking: boolean;
  /** On-canvas activity labels (`{code} {name} · {n}d`). */
  labels: boolean;
  /** Flanking start/finish **dates** on each bar (ADR-0054 §3, `VITE_CANVAS_LIVE_FEEDBACK`).
   * Optional so every existing caller/fixture stays valid and paints byte-for-byte; absent or
   * false ⇒ the pass never runs and not one `measureText` is spent. */
  dates?: boolean;
  /** The GPM **float / drift tails** (ADR-0054 §4, `VITE_CANVAS_LIVE_FEEDBACK`): a hollow tail
   * right of each bar for total float, left for drift.
   *
   * A view TOGGLE rather than a lens (a deliberate departure from the plan's "beside Baseline
   * overlay"): a lens exists because it needs data that can be loading or absent — Baseline
   * overlay is disabled with a reason when there is no active baseline. Float and drift are
   * already on every activity, so the control can never be unavailable and needs none of the
   * lens context's loading/error/enablement machinery. It belongs with Labels and Dates.
   *
   * Optional ⇒ absent/false ⇒ the pass never runs ⇒ byte-for-byte parity. */
  floatTails?: boolean;
  /** Annotate **relationship slack** on the SELECTED activity's own links (ADR-0054 §5). Scoped to
   * the selection on purpose: a number on every edge of a real network is noise that obscures the
   * very structure the diagram exists to show, so this is an *inspection* affordance. Optional ⇒
   * absent/false ⇒ the pass never runs ⇒ byte-for-byte parity. */
  linkSlack?: boolean;
  /** The read-only **Late-Start overlay** (ADR-0033 M4): render bars from the late dates for float
   * analysis. Per-user client state (never persisted); while on, all edit gestures are suppressed.
   * Default off. Only surfaced under `SCHEDULING_MODES_ENABLED`. */
  lateOverlay: boolean;
  /** User preference for the alternating month-band ground (F7b, `VITE_CANVAS_TIME_AXIS` +
   * `VITE_CANVAS_VISUAL_LANGUAGE`) — a plain boolean here so the pure painter module never imports
   * a flag; `TsldCanvas` composes the actual gate (`CANVAS_VISUAL_LANGUAGE_ENABLED && (view?.monthBands
   * ?? true)`) into `TsldScene.monthBands`, which is what the painter actually reads. Optional so
   * every existing caller/fixture stays valid; the default below is a plain literal, not a flag
   * read, so this module stays flag-free. */
  monthBands?: boolean;
  /** The **data-date line** (`VITE_CANVAS_DATA_DATE`, canvas status & feedback M1). A plain
   * boolean here — the pure painter module never imports a flag; `TsldCanvas` composes the gate
   * (`CANVAS_DATA_DATE_ENABLED && (view?.dataDate ?? true)`) into `TsldScene.dataDateLine`,
   * which is what the painter reads (the `monthBands` precedent). Optional so every existing
   * caller/fixture stays valid. */
  dataDate?: boolean;
  /** The pinned **WBS band** across the top of the canvas (ADR-0063, `VITE_WBS_IMPROVEMENTS`).
   * Default **off**: the band takes canvas height, and ADR-0031's canvas-maximal layout is not a
   * decision this may quietly reverse for every existing plan. A plain boolean here — the pure
   * painter module never imports a flag; the host composes the gate. Optional ⇒ absent/false ⇒ no
   * band is reserved, mounted or painted (the parity path). */
  wbsBand?: boolean;
  /**
   * **Show logic links** — the Gantt's dependency arrows (M4). Read only by the Gantt; the canvas
   * has always drawn its logic and has no equivalent to switch.
   *
   * Defaults **OFF** (the product owner's Q1 answer), which is the one toggle in this set that
   * does. Logic on a dense programme is a thicket, and a selected row's own links draw regardless
   * — so the off-state answers "why is this bar here?" without anybody turning anything on, and
   * the toggle buys the whole-window view rather than the capability.
   */
  logicLinks?: boolean;
}

/** All view layers on — the default before the user toggles anything (the Late overlay starts off). */
export const DEFAULT_VIEW_TOGGLES: TsldViewToggles = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: true,
  labels: true,
  lateOverlay: false,
  monthBands: true,
  // The data-date line defaults ON under its flag (a plan fact, like the month bands' ground);
  // the flag itself — composed by the host, never read here — is what decides reachability.
  dataDate: true,
  // The exception to "all layers on": see `logicLinks` above.
  logicLinks: false,
};
