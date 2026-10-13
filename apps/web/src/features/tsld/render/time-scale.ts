import { WorkingWeekdays } from '@repo/types';

import {
  addCalendarDays,
  clampPxPerDay,
  daysBetween,
  MAX_PX_PER_DAY,
  screenXOfDay,
  ZOOM_STOPS,
  ZOOM_TARGET_DAYS,
  zoomAt,
  type Size,
  type Viewport,
  type ZoomLevel,
} from './render-model';

/**
 * Pure time-scale helpers for the informative TSLD canvas: discrete zoom presets, the
 * adaptive multi-row date ruler, and the non-working-day predicate. No canvas/DOM/React —
 * the ruler overlay and the painter read from these, and they are exhaustively unit-tested
 * (ADR-0026: viewport geometry stays pure; ADR-0024: calendar semantics).
 */

/** The zoom presets, coarsest-visible-scale ascending, for the toolbar's segmented control. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year'];

/** Below this many px per day the ruler drops the per-day number row (labels would collide). */
export const DAY_ROW_MIN_PX_PER_DAY = 18;
/** Below this the ruler drops the month row too, leaving only year bands. */
export const MONTH_ROW_MIN_PX_PER_DAY = 1.3;

/**
 * The px-per-day scale that frames a preset's **nominal** target visible range (feature-spec.md
 * §4.3, `VITE_CANVAS_TIME_AXIS`) at the given canvas width, clamped to the legal scale bounds. Only
 * ever reached through the `rangeAnchored=true` path (already flag-gated by its callers), so it
 * clamps against {@link MAX_PX_PER_DAY} directly rather than taking a ceiling parameter. A preset
 * therefore frames its target range wherever the bounds allow, and clamps to the nearest legal scale
 * otherwise (documented residual: below ~440px, Year frames less than 3 years).
 */
export function pxPerDayForPreset(level: ZoomLevel, width: number): number {
  return clampPxPerDay(width / ZOOM_TARGET_DAYS[level], MAX_PX_PER_DAY);
}

/**
 * The zoom preset whose scale is closest to the current `pxPerDay` (log-distance). `width` and
 * `rangeAnchored` are **required** (not defaulted/optional) so the compiler — not a reviewer —
 * catches every call site: a defaulted width would let a forgotten site silently report the wrong
 * preset once the target scale became width-dependent (feature-spec.md §3.3). `rangeAnchored`
 * selects which target table distance is measured against: `pxPerDayForPreset` (this width) when
 * true, the fixed `ZOOM_STOPS` (width-independent, today's behaviour) when false — so flag-off
 * reporting stays byte-for-byte regardless of what width is passed in.
 */
export function presetOf(pxPerDay: number, width: number, rangeAnchored: boolean): ZoomLevel {
  let best: ZoomLevel = 'day';
  let bestDist = Infinity;
  for (const level of ZOOM_LEVELS) {
    const target = rangeAnchored ? pxPerDayForPreset(level, width) : ZOOM_STOPS[level];
    const dist = Math.abs(Math.log(pxPerDay) - Math.log(target));
    if (dist < bestDist) {
      bestDist = dist;
      best = level;
    }
  }
  return best;
}

/**
 * Reframe the viewport to a preset's scale, keeping the day at the viewport centre centred.
 * **Resize semantics (default): a preset is a command, not a mode** — picking one reframes, and a
 * later resize preserves the current scale (today's behaviour; consistent with ADR-0030's
 * viewport-preserve amendment). Re-pick to re-frame. The trigger label may drift after a large
 * resize; that is honest, since it reports the scale actually framed (`presetOf`, width-aware).
 * Re-deriving the scale on every resize was rejected: it would rescale a planner's diagram under
 * them while they dragged a window edge.
 *
 * `maxPxPerDay` is required so the caller resolves the flag-aware zoom ceiling (`MAX_PX_PER_DAY`
 * vs `LEGACY_MAX_PX_PER_DAY`) rather than this function reading either off the module — a
 * component-review finding caught the ceiling itself leaking into the flag-off path when it
 * wasn't threaded explicitly.
 */
export function zoomToPreset(
  view: Viewport,
  size: Size,
  level: ZoomLevel,
  rangeAnchored: boolean,
  maxPxPerDay: number,
): Viewport {
  const target = rangeAnchored ? pxPerDayForPreset(level, size.width) : ZOOM_STOPS[level];
  return zoomAt(view, size.width / 2, target / view.pxPerDay, maxPxPerDay);
}

/**
 * Zoom in/out by a factor about the viewport centre (the keyboard/button equivalent of wheel
 * zoom). `maxPxPerDay` required for the same reason as {@link zoomToPreset}.
 */
export function stepZoom(
  view: Viewport,
  size: Size,
  factor: number,
  maxPxPerDay: number,
): Viewport {
  return zoomAt(view, size.width / 2, factor, maxPxPerDay);
}

/** True when the viewport is already at (or clamped to) the given preset — for `aria-pressed`. */
export function isAtPreset(
  pxPerDay: number,
  level: ZoomLevel,
  width: number,
  rangeAnchored: boolean,
): boolean {
  return presetOf(pxPerDay, width, rangeAnchored) === level;
}

/**
 * Whether zooming in/out any further is possible (to disable the −/+ buttons at the bounds).
 * `maxPxPerDay` required for the same reason as {@link zoomToPreset}.
 */
export function canZoom(pxPerDay: number, factor: number, maxPxPerDay: number): boolean {
  return clampPxPerDay(pxPerDay * factor, maxPxPerDay) !== pxPerDay;
}

/** A single ruler cell: its left screen-x and the label to show (bands run to the next tick). */
export interface RulerTick {
  /** Screen x of the band's left edge (may be < 0 when the band starts off-screen left). */
  x: number;
  label: string;
}

/**
 * The adaptive ruler: year bands always; month bands once columns are wide enough; day
 * numbers only when fully zoomed in. Each row lists the band starts across the visible day
 * span (+ a one-column margin each side, so a band whose start is just off-screen still
 * anchors its label). Generation is strictly viewport-bounded — O(visible days), never O(plan).
 */
export interface RulerModel {
  years: RulerTick[];
  months: RulerTick[];
  days: RulerTick[];
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Weekday index (0 = Monday … 6 = Sunday) of a `YYYY-MM-DD` day, UTC-exact. */
function weekdayIndex(iso: string): number {
  // getUTCDay: 0 = Sunday … 6 = Saturday → shift so Monday = 0.
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Build the ruler bands for the current viewport. Day/month rows are omitted below their
 * legibility thresholds so labels never collide; the caller renders whichever rows are present.
 */
/**
 * How close a real month/year boundary may come to the pinned "sticky" label before that label is
 * suppressed (ADR-0064 T18).
 *
 * The ruler labels the month in view even when its 1st is off-screen, by emitting a **sticky** tick
 * at the first visible column. When the viewport happens to start a day or two before a boundary,
 * that sticky label and the boundary's own label are drawn a few pixels apart and overprint — the
 * `JuAug` a planner sees. This is the width below which the two cannot both be read; the painter
 * can pass a measured value, and the default is a conservative constant covering a three-letter
 * month at the ruler's type size.
 */
export const STICKY_LABEL_MIN_GAP_PX = 28;

/**
 * The widest day label ("28") at the ruler's 12 px type, in px. The default for a caller that has
 * not measured; chosen so `DAY_LABEL_GAP_PX` more still fits the 18 px floor, which keeps the row
 * exactly as it was at the default text size.
 */
export const DAY_LABEL_DEFAULT_WIDTH_PX = 15;

/** The air kept between two day numbers, the label's own 3 px inline padding. */
export const DAY_LABEL_GAP_PX = 3;

/**
 * How many days apart the day numbers are drawn, so each fits its measured width plus a gap
 * (#478, ADR-0056 amendment 2026-10-13). 1 = every day, 2 = every other day, 7 = Mondays. At 200 %
 * text the label is twice as wide while the 18 px floor that decides whether the row exists is
 * not, so a pitch just over the floor used to print "28" over "29".
 *
 * "Every other day" is the calendar's odd days and "Monday" is the product's fixed ISO week start
 * (`weekdayIndex`, 0 = Monday), never the browser's locale week: both depend only on the date, so
 * a pan or a different plan shows the same numbers.
 */
export function dayLabelStride(pxPerDay: number, labelWidthPx: number): 1 | 2 | 7 {
  const need = labelWidthPx + DAY_LABEL_GAP_PX;
  if (pxPerDay >= need) return 1;
  return pxPerDay * 2 >= need ? 2 : 7;
}

export function rulerTicks(
  view: Viewport,
  size: Size,
  dataDate: string,
  /** Measured label width, when the caller has a 2D context; else the documented default. */
  minLabelGapPx: number = STICKY_LABEL_MIN_GAP_PX,
  /** The widest day label as measured at the current text size; see {@link dayLabelStride}. */
  dayLabelWidthPx: number = DAY_LABEL_DEFAULT_WIDTH_PX,
): RulerModel {
  const firstDay = Math.floor((0 - view.originX) / view.pxPerDay) - 1;
  const lastDay = Math.ceil((size.width - view.originX) / view.pxPerDay) + 1;
  const showDays = view.pxPerDay >= DAY_ROW_MIN_PX_PER_DAY;
  const showMonths = view.pxPerDay >= MONTH_ROW_MIN_PX_PER_DAY;

  const years: RulerTick[] = [];
  const months: RulerTick[] = [];
  const days: RulerTick[] = [];

  // Parse the anchor date ONCE, then walk by integer date rollover — no per-day `Date`/ISO parsing
  // (that blew the ADR-0026 draw budget at coarse zoom, where thousands of days are visible). A
  // screen-x is computed only for a tick we actually emit.
  const anchor = new Date(`${addCalendarDays(dataDate, firstDay)}T00:00:00Z`);
  // A thinned row is chosen by the date itself, never the day's index in the view or its offset
  // from the data date, so panning (or a different plan) does not change which numbers show.
  const stride = showDays ? dayLabelStride(view.pxPerDay, dayLabelWidthPx) : 1;
  // Only the Monday stride needs the weekday, so the coarse zooms with thousands of days skip it.
  let weekday = stride === 7 ? weekdayIndex(addCalendarDays(dataDate, firstDay)) : 0;
  let y = anchor.getUTCFullYear();
  let m = anchor.getUTCMonth() + 1;
  let d = anchor.getUTCDate();
  for (let off = firstDay; off <= lastDay; off += 1) {
    // The first visible column seeds the *current* month/year label (pinned left, "sticky"), then
    // each month/year boundary adds the next — so the year/month in view is always labelled, not
    // only when a Jan-1 / 1st-of-month happens to be on screen.
    const first = off === firstDay;
    if (showDays && (stride === 1 || (stride === 2 ? oddNotLast(d, y, m) : weekday === 0))) {
      days.push({ x: screenXOfDay(off, view), label: String(d) });
    }
    if (showMonths && (first || d === 1)) {
      // The sticky label is **pinned to x = 0**, not to the off-screen first column it was seeded
      // from — it names the month you are looking at, so it belongs at the left edge rather than
      // wherever the viewport happens to have been scrolled to.
      months.push({ x: first ? 0 : screenXOfDay(off, view), label: MONTHS_SHORT[m - 1]! });
    }
    if (first || (d === 1 && m === 1)) {
      years.push({ x: first ? 0 : screenXOfDay(off, view), label: String(y) });
    }
    d += 1;
    if (stride === 7) weekday = (weekday + 1) % 7;
    if (d > daysInMonth(y, m)) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  // Drop a sticky label the next real boundary would overprint. Done here rather than in the
  // painter because it is a property of the model — two labels that cannot both be read is not a
  // drawing detail — and because the painter would have to re-derive which tick was the sticky one.
  return {
    years: dropOverprintedSticky(years, minLabelGapPx),
    months: dropOverprintedSticky(months, minLabelGapPx),
    days,
  };
}

/**
 * Remove the pinned first label when the following tick is closer than `minGapPx`, which is the
 * `JuAug` overprint. Only the first tick can be sticky, so only it is ever a candidate.
 */
function dropOverprintedSticky(ticks: RulerTick[], minGapPx: number): RulerTick[] {
  const [sticky, next] = ticks;
  if (!sticky || !next) return ticks;
  return next.x - sticky.x < minGapPx ? ticks.slice(1) : ticks;
}

/**
 * Whether the thinned (every other day) row shows day `d`: the odd days, so the 1st always shows,
 * except a month's last day when it is odd, because that day sits next to the following 1st and the
 * pair would overprint (31 then 1; 29 then 1 in a leap February).
 */
function oddNotLast(d: number, y: number, m: number): boolean {
  return d % 2 === 1 && d < daysInMonth(y, m);
}

/** Days in month `m` (1–12) of year `y`, Gregorian (UTC-agnostic — pure arithmetic). */
function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/**
 * The day offsets (from the data date) that begin a month / a year within `[firstDay, lastDay]`.
 * Used to draw the month/year gridlines. Parses a single anchor date then walks by **integer date
 * rollover** — no per-day `Date` parsing — so it stays cheap on the per-frame paint path even over
 * a wide (many-day) viewport.
 */
export function calendarBoundaries(
  firstDay: number,
  lastDay: number,
  dataDate: string,
): { months: number[]; quarters: number[]; years: number[]; startMonthIndex: number } {
  const anchor = new Date(`${addCalendarDays(dataDate, firstDay)}T00:00:00Z`);
  let y = anchor.getUTCFullYear();
  let m = anchor.getUTCMonth() + 1;
  let d = anchor.getUTCDate();
  const months: number[] = [];
  // Quarter starts (Jan/Apr/Jul/Oct), collected in the SAME walk (minimap-visual M3). A quarter
  // boundary IS a month boundary, so deriving it here rather than in a second pass keeps the one
  // date walk this module exists to be — the ADR-0059 "the time axis is shared, not
  // reimplemented" rule applied to a tier rather than to a view. It is additive: every existing
  // caller destructures the fields it wants and is untouched.
  const quarters: number[] = [];
  const years: number[] = [];
  // The absolute month ordinal of the FIRST visible day. Month banding derives its parity from
  // this rather than from "how many boundaries have I crossed", so the stripes are a property of
  // the calendar and cannot invert when the user pans (ADR-0055 §4).
  const startMonthIndex = y * 12 + (m - 1);
  for (let off = firstDay; off <= lastDay; off += 1) {
    if (d === 1) {
      months.push(off);
      if (m === 1 || m === 4 || m === 7 || m === 10) quarters.push(off);
      if (m === 1) years.push(off);
    }
    d += 1;
    if (d > daysInMonth(y, m)) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return { months, quarters, years, startMonthIndex };
}

/**
 * A plan's working-day calendar resolved for the client: the weekly {@link WorkingWeekdays}
 * mask plus a map of dated overrides (`YYYY-MM-DD` → is-working) from the calendar's exceptions
 * (a holiday is `false`; a worked exception is `true`). Built once on the route from the loaded
 * calendar so {@link isWorkingDay} stays a cheap pure lookup on the per-frame paint path.
 */
export interface WorkingDayCalendar {
  workingWeekdays: number;
  exceptions: ReadonlyMap<string, boolean>;
}

/**
 * Build a **fast** working-day predicate for a plan calendar, keyed by day offset. All the `Date`
 * work happens once here (the reference weekday + re-keying the exceptions by offset); the returned
 * closure then does zero `Date` allocation per call — just an integer-modulo weekday and a Map
 * lookup — so it's safe to call once per visible day on the per-frame canvas paint path (ADR-0026
 * draw budget). A dated exception overrides the weekly mask (ADR-0024).
 */
export function makeWorkingDayPredicate(
  dataDate: string,
  calendar: WorkingDayCalendar,
): (dayOffset: number) => boolean {
  const refWeekday = weekdayIndex(dataDate); // weekday of day offset 0 — one parse
  const byOffset = new Map<number, boolean>();
  for (const [iso, working] of calendar.exceptions) {
    byOffset.set(daysBetween(dataDate, iso), working);
  }
  const mask = calendar.workingWeekdays;
  return (dayOffset: number): boolean => {
    const override = byOffset.get(dayOffset);
    if (override !== undefined) return override;
    const weekday = (((refWeekday + dayOffset) % 7) + 7) % 7;
    return WorkingWeekdays.has(mask, weekday);
  };
}

/**
 * Whether the day at `dayOffset` from the data date is worked — a one-off check that delegates to
 * {@link makeWorkingDayPredicate}. For the per-frame paint path, build the predicate once (see
 * `TsldPanel`) rather than calling this per day.
 */
export function isWorkingDay(
  dayOffset: number,
  dataDate: string,
  calendar: WorkingDayCalendar,
): boolean {
  return makeWorkingDayPredicate(dataDate, calendar)(dayOffset);
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

/**
 * The viewer-**local** time-of-day fraction (0…1) for `nowMs` (a UTC epoch ms), for the Today
 * marker's fractional x (F6a, `VITE_CANVAS_TIME_AXIS`). `tzOffsetMin` follows
 * `Date.prototype.getTimezoneOffset()`'s convention (UTC = local + offset), so pass the live
 * value at call time — it already reflects any DST transition. Quantised to a 60s step (so the
 * result is stable across unrelated re-renders within the same minute); a non-finite input or an
 * out-of-range result returns `undefined`, which the caller (and the painter) treats as "no
 * fraction" — draw the whole-day integer offset instead, never a shifted line.
 */
export function todayDayFraction(nowMs: number, tzOffsetMin: number): number | undefined {
  if (!Number.isFinite(nowMs) || !Number.isFinite(tzOffsetMin)) return undefined;
  const quantised = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
  const localMs = quantised - tzOffsetMin * MINUTE_MS;
  const fraction = (((localMs % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) return undefined;
  return fraction;
}
