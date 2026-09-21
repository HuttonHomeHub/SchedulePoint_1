import type { ActivitySummary } from '@repo/types';

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
 * `visual` reads the engine's effective-Visual dates and is **the planning surface's only basis**
 * since the mode collapsed (M-F); `late` reads the late dates (the read-only Late-Start overlay,
 * ADR-0033 M4); `early` is classic CPM and survives for the **analyses**, which measure the
 * network rather than the plan as placed.
 */
export type BarDateSource = 'early' | 'visual' | 'late';

/**
 * Pick the source for the active view: the read-only **Late overlay** wins for display when on,
 * and otherwise a bar is drawn where it is PLACED.
 *
 * **There is no longer a mode to consult, and the parameter went with it** (M-F-T1). The plan's
 * `schedulingMode` decided this until the collapse; a caller that still held one would be asking a
 * question the product has stopped having an answer to, so the compiler removes the question rather
 * than the callers agreeing to stop asking.
 *
 * **What this does NOT mean is worth stating, because it is the epic's most likely
 * misunderstanding.** Returning `'visual'` unconditionally is not "Pass 1 is gone". Pass 1 is the
 * float, the criticality, the Late dates, the drift a placement is measured against, every DCMA
 * metric and the whole ADR-0034 conformance matrix; it runs on every recalculation exactly as
 * before. What collapsed is which of two already-computed columns a BAR is drawn from — and the
 * engine has always written both, for every plan, with no mode input of its own
 * (`compute.ts` results loop; `computeSchedule` takes no `schedulingMode` at all).
 *
 * On an activity nobody has placed, `visualEffectiveStart` equals `earlyStart`, so the great
 * majority of the estate draws in identical pixels. The population that moves is exactly the one
 * the `placement-on-early-plan` diagnostic was built to size: a bar carrying a placement made
 * while the plan was `VISUAL`, on a plan later switched back, which today renders at its early
 * dates and will render where it was placed.
 */
export function barDateSourceFor(lateOverlay: boolean): BarDateSource {
  return lateOverlay ? 'late' : 'visual';
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
 * pushed — and since the collapse that is no longer an alternative anybody could reach by accident
 * for some plans only: it would be wrong for every plan in the product.
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
