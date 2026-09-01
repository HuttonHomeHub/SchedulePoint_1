import type { DependencySummary } from '@repo/types';

/**
 * What a whole-day lag gesture should write, given the row it started from
 * (`docs/TECH_DEBT.md` #233).
 *
 * **The problem this exists to solve.** The TSLD lag-anchor drag and the Logic panel's
 * `Shift+←/→` nudge share one handler, and it read `dependency.lagDays`, compared it against the
 * gesture's day, and sent days. Both halves are **rounded** — `DependencySummary.lagDays` is
 * documented as "rounded from the stored minutes. A sub-day lag reads back as 0 here" — so on an
 * edge carrying a two-hour cure or a ninety-minute lift, one drag silently flattened the remainder
 * to a whole day. That is ADR-0070 M4's defect (a canvas move resending a rounded duration) one
 * field along.
 *
 * **Why the answer is a DELTA rather than an absolute.** The gesture is day-quantised at its root:
 * `gesture-machine.ts` runs the pointer through `dayColumnAt` — an integer column — before
 * `lagFromAnchorDay` walks it to a whole-day lag. It never had sub-day resolution and giving it
 * some was measured and rejected: on a 1400px canvas an eight-hour day is 100px at the Day preset
 * and 1.3px at Year, so one pixel buys 5 minutes at one end and **6.3 hours** at the other. A
 * gesture whose precision varies 78× with the zoom cannot author a minute figure anybody meant.
 *
 * So the drag says only *how many days you moved*, and that many days' worth of minutes is added to
 * what is stored. The stored remainder rides through untouched, and — the part worth noticing —
 * **the rounding cancels**: `lagDays` appears on both sides of the subtraction, so nothing here
 * depends on knowing whether it was rounded up, down or toward zero.
 */

/** A drag that should be written, or the reason it should not be. */
export type LagDragWrite =
  { kind: 'noop' } | { kind: 'minutes'; lagMinutes: number } | { kind: 'days'; lagDays: number };

/**
 * Resolve a gesture's target whole-day lag against the row it started from.
 *
 * `hoursPerDay` is **required and may be `undefined`**, which is a real answer rather than a
 * default — the calendar list can be loading, absent, or missing the bound row, and after ADR-0068
 * there is no safe fallback factor. Without it the result degrades to `days`, which is exactly the
 * behaviour that shipped before this function existed: correct on a whole-day lag, and lossy on a
 * sub-day one, but never *wrong about a factor it guessed*. Guessing 24 would read a planner's
 * eight-hour day as three, and guessing 8 would do the reverse — both silently, both changing dates.
 */
export function resolveLagDragWrite(
  dependency: Pick<DependencySummary, 'lagDays' | 'lagMinutes'>,
  targetLagDays: number,
  hoursPerDay: number | undefined,
): LagDragWrite {
  const deltaDays = targetLagDays - dependency.lagDays;
  // Zero days moved is genuinely nothing to write, and that is now an honest statement rather than
  // the old guard's accidental one: under whole-day semantics a pointer that stayed inside its day
  // column has not expressed a change, and a sub-day lag's anchor sits in the same column as a zero
  // one. Authoring an exact sub-day value is the Logic panel's `d`/`h`/`m` field (ADR-0070), which
  // is the only surface on which "twenty minutes" is expressible at all.
  if (deltaDays === 0) return { kind: 'noop' };
  if (hoursPerDay === undefined) return { kind: 'days', lagDays: targetLagDays };
  return { kind: 'minutes', lagMinutes: dependency.lagMinutes + deltaDays * hoursPerDay * 60 };
}

/**
 * Does this row carry time the whole-day gesture cannot express — i.e. would a reader be surprised
 * that dragging it does not reach zero?
 *
 * Used only to shade/describe, never to refuse: the write itself is decided by
 * {@link resolveLagDragWrite}. Returns false when the factor is unknown, because "I cannot tell"
 * must not render as "there is none".
 */
export function hasSubDayLag(
  dependency: Pick<DependencySummary, 'lagDays' | 'lagMinutes'>,
  hoursPerDay: number | undefined,
): boolean {
  if (hoursPerDay === undefined) return false;
  return dependency.lagMinutes !== dependency.lagDays * hoursPerDay * 60;
}
