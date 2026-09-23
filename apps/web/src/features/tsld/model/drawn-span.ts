import type { ActivitySummary } from '@repo/types';

import { daysBetween } from '../render/render-model';

import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';

/**
 * **The day span a bar is DRAWN over, for anything that reasons about the picture.**
 *
 * Since ADR-0148 the canvas draws a bar at its effective-Visual dates, not its early dates: a bar
 * hand-placed away from where logic would put it is drawn at the placement, and an unplaced bar
 * pushed by a placed predecessor is drawn where it was pushed. `to-render-model.ts` resolves that
 * through {@link barDatesFor}. Seven places that reason about the SAME picture did not — Arrange,
 * the keyboard nudge, the duration nudge's ghost, the plural drag's delta, the finish-edge
 * resize's working-day count and the `n` create prefill all read `earlyStart`/`earlyFinish`, and
 * the spoken link slack (`TsldPanel`'s `linkSlack`) fed the API rows' early dates into a builder
 * whose canvas twin is fed the drawn ones.
 *
 * On an unplaced, unpushed bar the two are the same dates, which is why nothing reported it for a
 * release; the product owner found it on 2026-09-23 when Arrange put a placed bar on top of its
 * predecessor, because it judged one picture and the canvas painted another. The fix is this one
 * resolver rather than seven corrected expressions, for the reason `lib/bar-dates.ts` gives: two
 * answers to "where is this bar" drift, and the drift is invisible to everybody except a planner
 * looking at a result that does not match the screen.
 *
 * `endDay` is the day of the finish date, inclusive — the convention `packLanes` and the drag
 * ghosts already use — and a missing finish collapses to the start, as a milestone does.
 */
export interface DrawnDaySpan {
  readonly startDay: number;
  readonly endDay: number;
}

/**
 * Resolve where `activity` is drawn under `source`, in days from `dataDate`, or `null` when it has
 * no drawn start (before a recalculation) — in which case the canvas draws nothing for it either.
 */
export function drawnDaySpan(
  activity: Pick<
    ActivitySummary,
    | 'earlyStart'
    | 'earlyFinish'
    | 'visualEffectiveStart'
    | 'visualEffectiveFinish'
    | 'lateStart'
    | 'lateFinish'
  >,
  source: BarDateSource,
  dataDate: string,
): DrawnDaySpan | null {
  const { start, finish } = barDatesFor(activity, source);
  if (start === null) return null;
  const startDay = daysBetween(dataDate, start);
  return { startDay, endDay: finish === null ? startDay : daysBetween(dataDate, finish) };
}
