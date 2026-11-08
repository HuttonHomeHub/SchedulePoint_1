/**
 * **How one matched activity's float is compared across two revisions** (`docs/TECH_DEBT.md` #318,
 * ADR-0214). One rule, shared by the variance read, the revision delta and the change list, so the
 * three cannot answer "did this float move?" differently.
 *
 * Float is compared in **working minutes**, which no calendar edit can re-frame, and converted to
 * days **once**, on one frame the caller passes in. The day column cannot be compared across two
 * revisions: `Math.round(minutes / factor)` was taken on each side's own day length, and the rounding
 * discarded what a later comparison would need (`round(2400/1440) = 2`, the truth at 480 is 5).
 *
 * A row can state its float in days with no minutes — calculated before the minutes were stored, or
 * on a plan not recalculated since. That is **not comparable**, never zero and never rescaled: the
 * minutes are unrecoverable from a rounded day, and a guess would be the defect this fixes.
 */

/** The two columns one side holds. `minutes` NULL beside non-null `days` means "not comparable". */
export interface FloatSide {
  readonly days: number | null;
  readonly minutes: number | null;
}

export type FloatComparison =
  /** Both sides hold minutes. */
  | { readonly kind: 'COMPARABLE'; readonly movementMinutes: number }
  /** Both sides were calculated but a side has no minutes. Counted and stated, never guessed. */
  | { readonly kind: 'NOT_COMPARABLE' }
  /** A side's float was never calculated; the existing "unknown" handling already says why. */
  | { readonly kind: 'NOT_CALCULATED' };

export function compareFloat(from: FloatSide, to: FloatSide): FloatComparison {
  if (from.days === null || to.days === null) return { kind: 'NOT_CALCULATED' };
  if (from.minutes === null || to.minutes === null) return { kind: 'NOT_COMPARABLE' };
  return { kind: 'COMPARABLE', movementMinutes: to.minutes - from.minutes };
}

/**
 * Minutes as whole days on `frameMinutes` (the earlier revision's plan working day), or null when
 * there are no minutes. The one conversion every surface shares. Half rounds **away from zero**,
 * so +2.5 and −2.5 days are 3 and −3: `Math.round` rounds half toward +∞ and would read a lost
 * half day as −2 where a gained one reads +3. A small negative is `0`, never `-0`.
 */
export function floatDaysOnFrame(minutes: number | null, frameMinutes: number): number | null {
  if (minutes === null) return null;
  const days = Math.sign(minutes) * Math.round(Math.abs(minutes) / frameMinutes);
  return days === 0 ? 0 : days;
}
