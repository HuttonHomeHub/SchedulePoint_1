import { finishMilestoneDayShift as sharedShift } from '@repo/layout';
import type { ActivityType } from '@repo/types';

/**
 * **Where a finish milestone sits on a time axis: at the END of the day it is dated by** (#381,
 * ADR-0155; `docs/specs/finish-milestone-date/`).
 *
 * The engine reports a finish milestone by the day it closes, so after a task ending Friday it
 * reads Friday, and its diamond belongs on the boundary between Friday and the next day, where the
 * task's bar ends. Every other activity's start is drawn at the START of its day. So a finish
 * milestone's day on an axis is its reported day **plus one**, and a day read back off an axis for
 * one is that day **minus one** before it is written as a date.
 *
 * **Both of its dates shift, not only the start.** Every axis consumer treats a milestone as a
 * one-day span whose start and finish are the same day, so shifting only one would give it a
 * negative length. With both shifted, a plan on a 24-hour calendar draws every diamond at exactly
 * the pixel the previous rule drew it (FC-8), because there the old reading was always the next
 * day. On a Monday-to-Friday calendar the diamond moves from Monday 00:00 back to the end of
 * Friday, which is the defect #381 fixes.
 *
 * It is a shift, not a date conversion, so it lives here as one rule both views import rather than
 * inside either (the `lib/bar-dates.ts` argument). `finish-milestone-day.structural.test.ts` holds
 * every axis site to it.
 */
export function finishMilestoneDayShift(type: ActivityType | undefined): 0 | 1 {
  // One rule for both halves of the product: the importer's row packing reads the same shift from
  // `@repo/layout` (layout-interchange M1), so it cannot disagree with where the canvas draws.
  return sharedShift(type);
}
