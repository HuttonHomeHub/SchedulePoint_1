import type { DependencyType } from '@repo/types';

/**
 * Working-time day arithmetic for the TSLD render model (ADR-0078 S8).
 *
 * Extracted verbatim from `render-model.ts`, which had grown to hold five unrelated concerns in
 * one 1,660-line file. This is the one the others depend on rather than the reverse — the link
 * routing needs `lagAnchorDay` to place a time-true anchor, and every geometry helper needs
 * `daysBetween` — so it moves first, and nothing here imports a sibling.
 *
 * Pure and calendar-agnostic by design: the caller injects a {@link DayWalk} built from the plan's
 * working-day predicate, so the render model still does no CPM or calendar arithmetic of its own
 * (ADR-0023/0024 keep those server-side).
 *
 * `render-model.ts` re-exports every symbol below, so no consumer's import changed.
 */

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `fromIso` to `toIso` (`YYYY-MM-DD`), signed. UTC-exact. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

/** The calendar date `n` days after `iso` (`YYYY-MM-DD`), UTC-exact — inverse of {@link daysBetween}. */
export function addCalendarDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Walk `n` days from a day offset and return the day offset reached. The working-day variant
 * counts working days (a lead — negative `n` — walks left); the elapsed variant is plain addition.
 * Injected into the anchor geometry so the render model stays free of calendar/CPM logic — the
 * caller builds it from the plan's working-day predicate (the same seam the non-working wash uses).
 */
export type DayWalk = (dayOffset: number, n: number) => number;

/** The outward walk bound (days), mirroring `SNAP_HORIZON_DAYS` — a pathological all-non-working
 * calendar falls back to an elapsed walk rather than scanning forever. */
export const WALK_HORIZON_DAYS = 366;

/** The elapsed-calendar-day walk — a `TWENTY_FOUR_HOUR` lag is elapsed time, not working time
 * (ADR-0036 §6), so its anchor offset is plain day addition. */
export const ELAPSED_DAY_WALK: DayWalk = (dayOffset, n) => dayOffset + n;

/**
 * Build the working-day {@link DayWalk} for a plan calendar: the day reached after consuming `n`
 * working days from `dayOffset`, always landing on a working day (so a lag anchor never sits on a
 * weekend). Memoised — an edge-dense frame re-asks the same walks — and bounded: if the scan
 * exhausts the horizon (no working day found) it falls back to the elapsed result, never hanging
 * (the `snapToWorkingDay` contract).
 */
export function makeWorkingDayWalk(
  isWorkingDay: (dayOffset: number) => boolean,
  horizon = WALK_HORIZON_DAYS,
): DayWalk {
  const memo = new Map<string, number>();
  return (dayOffset, n) => {
    const key = `${dayOffset}:${n}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    // Any sane calendar has a working day within a week, so |n| working days lie within ~7|n|
    // days; the horizon on top guards the pathological calendar.
    const bound = horizon + Math.abs(n) * 7;
    const step = n < 0 ? -1 : 1;
    const target = Math.abs(n);
    let day = n < 0 ? dayOffset - 1 : dayOffset;
    let seen = 0;
    let result: number | null = null;
    for (let i = 0; i <= bound; i += 1, day += step) {
      if (n >= 0) {
        // Forward: consume `n` working days strictly before the landing day, then land working.
        if (seen === target && isWorkingDay(day)) {
          result = day;
          break;
        }
        if (isWorkingDay(day)) seen += 1;
      } else {
        // Backward: the landing day itself is the last of the `|n|` working days walked over.
        if (isWorkingDay(day)) seen += 1;
        if (seen === target) {
          result = day;
          break;
        }
      }
    }
    const value = result ?? dayOffset + n;
    memo.set(key, value);
    return value;
  };
}

/**
 * The day offset a relationship's lag anchor sits at for a given signed lag — the ONE forward
 * mapping shared by the render path ({@link lagAnchorPoints}) and the drag path's inverse
 * ({@link lagFromAnchorDay}), so the picture and the gesture can never disagree (ADR-0052 M3).
 * `predStartDay`/`predFinishDay` are the predecessor bar's inclusive whole-day span:
 *
 * - **FS** — the lag runs from the day after the predecessor's inclusive finish.
 * - **FF** — likewise from the finish, but the anchor marks the constrained successor *finish*,
 *   whose inclusive day converts to the `+1` right edge.
 * - **SS/SF** — the lag embeds along the predecessor bar from its start (the GPM embed point).
 */
export function lagAnchorDay(
  predStartDay: number,
  predFinishDay: number,
  type: DependencyType,
  lagDays: number,
  walk: DayWalk,
): number {
  if (type === 'FS') return walk(predFinishDay + 1, lagDays);
  if (type === 'FF') return walk(predFinishDay, lagDays) + 1;
  return walk(predStartDay, lagDays); // SS / SF — embed along the predecessor from its start
}

/**
 * The signed lag whose anchor sits at (or nearest, snapping **toward zero**) `anchorDay` — the
 * exact inverse of {@link lagAnchorDay} over the same injected walk (ADR-0052 M3: the lag drag
 * reads and writes against the render mapping, one source of truth). Because the walk is strictly
 * monotone in the lag, `lagFromAnchorDay(lagAnchorDay(n)) === n` for every integer `n`; a pointer
 * day that falls between two valid anchor days (a non-working day) snaps to the nearer-zero lag,
 * so `lagAnchorDay(lagFromAnchorDay(x))` is the snapped anchor. Horizon-bounded like the walk
 * itself: a pathological calendar falls back to the elapsed difference, never hanging.
 */
export function lagFromAnchorDay(
  predStartDay: number,
  predFinishDay: number,
  type: DependencyType,
  anchorDay: number,
  walk: DayWalk,
  horizon = WALK_HORIZON_DAYS,
): number {
  const at = (n: number): number => lagAnchorDay(predStartDay, predFinishDay, type, n, walk);
  const base = at(0);
  if (anchorDay === base) return 0;
  const dir = anchorDay > base ? 1 : -1;
  let n = 0;
  for (let i = 0; i < horizon; i += 1) {
    const next = at(n + dir);
    // Walked past the pointer day without landing on it → the pointer sits between two valid
    // anchors; keep the nearer-zero lag (snap toward zero).
    if (dir > 0 ? next > anchorDay : next < anchorDay) return n;
    n += dir;
    if (next === anchorDay) return n;
  }
  // Horizon exhausted (pathological calendar) — the elapsed difference, the walk's own fallback.
  return anchorDay - lagAnchorDay(predStartDay, predFinishDay, type, 0, ELAPSED_DAY_WALK);
}
