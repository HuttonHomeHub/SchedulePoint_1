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
  /**
   * The **feasible window** (one-planning-surface M-E, `VITE_CANVAS_LIVE_FEEDBACK`): one hollow
   * bracket spanning `[earlyStart, lateFinish]` with a cap at each end, drawn beneath the bar so
   * the bar occludes its middle.
   *
   * **The KEY is deliberately unchanged from when this drew the ADR-0054 §4 float and drift
   * tails**, which the window replaces — they were one fact drawn twice. Renaming the key would
   * touch three consumers and the whole `TsldViewToggles` contract to describe the same overlay;
   * the label is what a planner reads, and that is what moved.
   *
   * **Its risk note in the plan said the rename must "preserve the planner's state rather than
   * resetting it", and there is no state to preserve.** `use-tsld-canvas-ui-state.ts` holds this in
   * `useState(DEFAULT_VIEW_TOGGLES)` and its own docblock calls it "never server state, never
   * persisted" — so the toggle already resets on every mount, under either name. Recorded here
   * rather than left as a reassuring sentence in a plan nobody re-reads.
   *
   * A view TOGGLE rather than a lens (a deliberate departure from the original plan's "beside
   * Baseline overlay"): a lens exists because it needs data that can be loading or absent —
   * Baseline overlay is disabled with a reason when there is no active baseline. The window's
   * inputs are on every activity, so the control can never be unavailable and needs none of the
   * lens context's loading/error/enablement machinery. It belongs with Labels and Dates.
   *
   * Optional ⇒ absent/false ⇒ the pass never runs ⇒ byte-for-byte parity. */
  floatTails?: boolean;
  /** **Link gaps** (NetPoint grammar M3-T3, spec §4.2 G6; the key keeps its ADR-0054 §5 name).
   *
   * On the refreshed link path this labels EVERY waiting non-driving link with the working days it
   * waits (`link-gap.ts`), at the working tier or finer (`lodTier`), in place of the dashed waiting
   * run it retires: the dash said "something waits here" and the label says how long. ADR-0054 §5
   * scoped the number to the selection because a number on every edge was noise, and that reason
   * holds for a number on every EDGE — a gap label is drawn only where there is waiting to state, is
   * withheld where no horizontal stretch holds it, and is dropped at the overview tier. The
   * reference the product owner chose labels every gap, and CQ-5 set the unit.
   *
   * **On by default.** `undefined` also reads as on in the refreshed painter (`!== false`), so a
   * caller that never learnt the key keeps the picture the product owner approved. The legacy path
   * (flag-off rollback) still reads `=== true` and draws its selection-scoped chip only when asked,
   * which with this default is always: that is a change to an unreachable configuration (ADR-0088
   * D1), recorded rather than hidden. */
  linkSlack?: boolean;
  /** **Activity codes** on the canvas (NetPoint grammar M4-T1, spec §4.2 G7, CQ-10). Off by
   * default: the reference prints names without codes, and the code is still in every activity's
   * accessible name, the selection panel and the Activities table. On, a name reads
   * `{code} {name}`. */
  activityCodes?: boolean;
  /** **Duration & float**, the centre item under a bar (NetPoint grammar M4-T1, spec §4.2 G7). Off
   * by default, since the reference prints no duration or float under its bars; on, it is drawn at
   * the detail tier only, and a critical activity prints its duration alone (its float is none). */
  centreItem?: boolean;
  /** The read-only **Late-Start overlay** (ADR-0033 M4): render bars from the late dates for float
   * analysis. Per-user client state (never persisted); while on, all edit gestures are suppressed.
   * Default off. Ungated since the mode collapsed (one-planning-surface M-F-T5). */
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
  /**
   * **On by default since NetPoint-layout M1** (spec §4.6, CQ-3). The row reserves a line under
   * every bar for its dates, and the product owner chose the reference's treatment — dates under the
   * nodes — as the picture a planner opens a plan to. Off, that line is empty space; the switch stays
   * (`View ▾ ▸ Dates`), and it is still not persisted.
   */
  dates: true,
  linkSlack: true,
  activityCodes: false,
  centreItem: false,
  lateOverlay: false,
  /**
   * **Off by default since the workspace redesign (M4-T1).**
   *
   * ADR-0055 §4 shipped the alternating month band as ground, on by default, so a planner could
   * count months without reading a label. The product owner looked at the shipped diagram and said
   * row striping is not useful *at the moment* — and named the case where it would be, which is
   * swimlanes. That is not this band, but the judgement transfers: the drafting-table diagram wants
   * one quiet ground with the structure carried by rules, and two grounds alternating under a wall
   * of bars is the second-loudest thing on the picture after the weekend hatch that went with it.
   *
   * **The switch stays** (`View ▾ ▸ Structure ▸ Month bands`, ADR-0056 F7b). It costs a line, and
   * the README already records striping as a legitimate tracking aid at scale — so this is a
   * default, not a deletion, and a planner who wants it back is one menu item away.
   */
  monthBands: false,
  // The data-date line defaults ON under its flag (a plan fact, like the month bands' ground);
  // the flag itself — composed by the host, never read here — is what decides reachability.
  dataDate: true,
  // The exception to "all layers on": see `logicLinks` above.
  logicLinks: false,
};
