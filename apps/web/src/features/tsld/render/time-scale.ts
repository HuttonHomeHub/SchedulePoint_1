import { WorkingWeekdays } from '@repo/types';

import {
  addCalendarDays,
  clampPxPerDay,
  daysBetween,
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
 * §4.3, `VITE_CANVAS_TIME_AXIS`) at the given canvas width, clamped to the legal scale bounds. A
 * preset therefore frames its target range wherever the bounds allow, and clamps to the nearest
 * legal scale otherwise (documented residual: below ~440px, Year frames less than 3 years).
 */
export function pxPerDayForPreset(level: ZoomLevel, width: number): number {
  return clampPxPerDay(width / ZOOM_TARGET_DAYS[level]);
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
 */
export function zoomToPreset(
  view: Viewport,
  size: Size,
  level: ZoomLevel,
  rangeAnchored: boolean,
): Viewport {
  const target = rangeAnchored ? pxPerDayForPreset(level, size.width) : ZOOM_STOPS[level];
  return zoomAt(view, size.width / 2, target / view.pxPerDay);
}

/** Zoom in/out by a factor about the viewport centre (the keyboard/button equivalent of wheel zoom). */
export function stepZoom(view: Viewport, size: Size, factor: number): Viewport {
  return zoomAt(view, size.width / 2, factor);
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

/** Whether zooming in/out any further is possible (to disable the −/+ buttons at the bounds). */
export function canZoom(pxPerDay: number, factor: number): boolean {
  return clampPxPerDay(pxPerDay * factor) !== pxPerDay;
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
export function rulerTicks(view: Viewport, size: Size, dataDate: string): RulerModel {
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
  let y = anchor.getUTCFullYear();
  let m = anchor.getUTCMonth() + 1;
  let d = anchor.getUTCDate();
  for (let off = firstDay; off <= lastDay; off += 1) {
    // The first visible column seeds the *current* month/year label (pinned left, "sticky"), then
    // each month/year boundary adds the next — so the year/month in view is always labelled, not
    // only when a Jan-1 / 1st-of-month happens to be on screen.
    const first = off === firstDay;
    if (showDays) days.push({ x: screenXOfDay(off, view), label: String(d) });
    if (showMonths && (first || d === 1)) {
      months.push({ x: screenXOfDay(off, view), label: MONTHS_SHORT[m - 1]! });
    }
    if (first || (d === 1 && m === 1)) {
      years.push({ x: screenXOfDay(off, view), label: String(y) });
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
  return { years, months, days };
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
): { months: number[]; years: number[]; startMonthIndex: number } {
  const anchor = new Date(`${addCalendarDays(dataDate, firstDay)}T00:00:00Z`);
  let y = anchor.getUTCFullYear();
  let m = anchor.getUTCMonth() + 1;
  let d = anchor.getUTCDate();
  const months: number[] = [];
  const years: number[] = [];
  // The absolute month ordinal of the FIRST visible day. Month banding derives its parity from
  // this rather than from "how many boundaries have I crossed", so the stripes are a property of
  // the calendar and cannot invert when the user pans (ADR-0055 §4).
  const startMonthIndex = y * 12 + (m - 1);
  for (let off = firstDay; off <= lastDay; off += 1) {
    if (d === 1) {
      months.push(off);
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
  return { months, years, startMonthIndex };
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
