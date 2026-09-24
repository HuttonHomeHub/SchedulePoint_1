/**
 * **The days a bar occupies on the diagram — the one rule the canvas and the importer share**
 * (layout-interchange M1; ADR-0069, ADR-0155).
 *
 * The importer's phase 3 packed rows on an activity's EARLY dates while the canvas draws the placed
 * ones, so an import could open with bars overlapping in their rows on the very first screen
 * (`docs/specs/layout-interchange/m0-measurement.md`, M0-T4). Two derivations of "where is this bar"
 * agree on the day they are written and drift after that, which is the ADR-0065 `routeOrthogonal`
 * rule; this is the one derivation, and the web's `drawn-span.ts` delegates to it.
 *
 * `type` is a plain string, not `@repo/types`' `ActivityType`, so this package stays a leaf with no
 * workspace dependency (ADR-0019).
 */

/**
 * **A finish milestone sits on the END of its dated day** (ADR-0155): it is dated by the day it
 * closes, so on an axis it is one day later than its date. Every other activity sits at the start of
 * its day. The shift applies to both of a milestone's dates, or it would have a negative length.
 */
export function finishMilestoneDayShift(type: string | undefined): 0 | 1 {
  return type === 'FINISH_MILESTONE' ? 1 : 0;
}

export interface DrawnSpanInput {
  readonly type: string;
  /** Inclusive `YYYY-MM-DD` of the dates the bar is DRAWN at, or null when it is not drawn. */
  readonly start: string | null;
  readonly finish: string | null;
}

export interface DrawnDaySpan {
  readonly startDay: number;
  /** Inclusive. Equal to `startDay` for a one-day bar or a milestone. */
  readonly endDay: number;
}

/**
 * The inclusive day span a bar is drawn over, measured by `dayOf` (a day number for an ISO date —
 * relative to the data date on the canvas, absolute on the server; only differences matter). Null
 * when the bar has no start and so is not drawn; a missing finish collapses the span to its start.
 */
export function drawnSpanDays(
  input: DrawnSpanInput,
  dayOf: (iso: string) => number,
): DrawnDaySpan | null {
  if (input.start === null) return null;
  const shift = finishMilestoneDayShift(input.type);
  const startDay = dayOf(input.start) + shift;
  return { startDay, endDay: input.finish === null ? startDay : dayOf(input.finish) + shift };
}
