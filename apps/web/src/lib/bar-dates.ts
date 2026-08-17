import type { ActivitySummary, SchedulingMode } from '@repo/types';

/**
 * **Which persisted dates draw a bar — for every view, resolved in one place.**
 *
 * This lived inside `features/tsld/render/to-render-model.ts` and was therefore reachable only by
 * the canvas. The Gantt never got it: `layout/bar-geometry.ts` read `earlyStart`/`earlyFinish`
 * unconditionally, so in a **VISUAL** plan the two views disagreed about where every hand-placed bar
 * sat — each internally consistent, so only a planner opening the same plan both ways would ever
 * see it (`docs/TECH_DEBT.md` #135, found 2026-08-17 by reading, not from a report).
 *
 * The fix is deliberately a **shared resolver rather than a second copy of the ternary**. Two
 * implementations of "which column draws this bar" would drift, and the drift would be invisible
 * for exactly the reason the original defect was — this is the ADR-0065 `routeOrthogonal` argument
 * and the ADR-0059 "the time axis is shared, not reimplemented" rule, applied to dates instead of
 * pixels. `to-render-model.ts` re-exports the type and the picker so no canvas consumer changed
 * (ADR-0078's barrel-preserving move).
 *
 * It lives in `lib/` rather than in either feature because a module both views import must belong to
 * neither — the leak `features/float-paths` already has a structural test about.
 */

/**
 * `early` is classic CPM (the earliest dates) and the default; `visual` reads the engine's
 * effective-Visual dates (VISUAL mode); `late` reads the late dates (the read-only Late-Start
 * overlay, ADR-0033 M4).
 */
export type BarDateSource = 'early' | 'visual' | 'late';

/**
 * Pick the source for the active view (ADR-0033): the read-only **Late overlay** wins for display
 * when on, else the plan's **scheduling mode** decides.
 *
 * Callers gate on `VITE_SCHEDULING_MODES`; flag-off the mode is always `EARLY` and the overlay is
 * never on, so this yields `early` — today's behaviour, unchanged.
 */
export function barDateSourceFor(mode: SchedulingMode, lateOverlay: boolean): BarDateSource {
  if (lateOverlay) return 'late';
  return mode === 'VISUAL' ? 'visual' : 'early';
}

/** The start/finish a bar draws at under `source`. Either may be null before a recalculation. */
export interface BarDates {
  start: string | null;
  finish: string | null;
}

/**
 * Resolve one activity's drawn span.
 *
 * `visualEffectiveStart` is **not** `visualStart`: the first is where the engine says the bar
 * renders after the effective-Visual pass, the second is the planner's placement input
 * (`packages/types`). Reading the input would redraw a bar at a placement the engine has already
 * pushed, which is the same class of wrong as reading the early dates in VISUAL mode.
 */
export function barDatesFor(
  activity: Pick<
    ActivitySummary,
    | 'earlyStart'
    | 'earlyFinish'
    | 'visualEffectiveStart'
    | 'visualEffectiveFinish'
    | 'lateStart'
    | 'lateFinish'
  >,
  source: BarDateSource = 'early',
): BarDates {
  if (source === 'visual') {
    return { start: activity.visualEffectiveStart, finish: activity.visualEffectiveFinish };
  }
  if (source === 'late') {
    return { start: activity.lateStart, finish: activity.lateFinish };
  }
  return { start: activity.earlyStart, finish: activity.earlyFinish };
}
