import type { DurationType, EditedField } from '@repo/types';

import { formatDurationText, formatWorkingMinutesNoDays } from '@/lib/duration-text';

/**
 * Client-side preview of the **duration-type triad** (M7 rung 4, ADR-0040) — narrowly the one
 * user-visible cross-resource effect: editing a driving assignment's units/rate can **derive the
 * owning activity's duration**. This mirrors the server's pure `resolveTriad`
 * (`apps/api/.../duration-type/resolve-triad.ts`) for that single case so the assignment editor can
 * show "this will set the duration to N" before the write. The **server remains authoritative** —
 * it recomputes and persists the real value, which the UI refetches; this is a hint, not the source of
 * truth, so it deliberately covers only the derive-duration branch (the non-duration recomputes just
 * move a same-row Units/Rate the server returns).
 *
 * Duration derives (`D := Units ÷ Units/Time`) only under the two **units-driven** types on the
 * complementary edit (ADR-0035 §26 truth table): `FIXED_UNITS` on a rate edit, `FIXED_UNITS_TIME` on a
 * units edit. Every other (type, edited) pair holds the duration — the preview returns `null` for them.
 */

/**
 * Minutes in an hour — the only fixed factor this module has. There is deliberately **no**
 * `MINUTES_PER_DAY` beside it: a day is a per-calendar quantity (ADR-0068), so days are converted
 * only by {@link formatDerivedDuration}, which is handed the factor.
 */
const MINUTES_PER_HOUR = 60;

/**
 * The (type, edited) pairs whose recompute **derives the duration** (`D := U/R`). Exactly the two
 * units-driven types on their complementary edit; absent pairs hold the entered duration.
 */
function derivesDuration(durationType: DurationType, editedField: EditedField): boolean {
  return (
    (durationType === 'FIXED_UNITS' && editedField === 'UNITS_PER_HOUR') ||
    (durationType === 'FIXED_UNITS_TIME' && editedField === 'UNITS')
  );
}

/** Round working hours to a whole minute, clamped `>= 0` — the same grid the engine stores on. */
function toWholeMinutes(workingHours: number): number {
  return Math.max(0, Math.round(workingHours * MINUTES_PER_HOUR));
}

/**
 * The outcome of a units-driven duration derivation preview:
 * - `derived` — this edit derives the duration; `durationMinutes` is the whole-minute result.
 * - `blocked` — this edit would derive it, but the rate is `<= 0`, so `D := U/R` cannot be computed
 *   (the client mirror of the server's N20 `UNITS_PER_HOUR_ZERO` reject) — surface it, don't guess.
 */
export type DurationDerivationPreview =
  { kind: 'derived'; durationMinutes: number } | { kind: 'blocked' };

/**
 * Preview the duration a driving-assignment units/rate edit will derive, or `null` when this
 * (type, edited) pair holds the duration (nothing to preview). `budgetedUnits` / `unitsPerHour` are the
 * post-edit values the planner has entered. Pure — no rounding surprises beyond the engine's
 * whole-minute grid.
 */
export function previewDerivedDuration(
  durationType: DurationType,
  editedField: EditedField,
  values: { budgetedUnits: number; unitsPerHour: number },
): DurationDerivationPreview | null {
  if (!derivesDuration(durationType, editedField)) return null;
  if (!(values.unitsPerHour > 0)) return { kind: 'blocked' };
  const workingHours = values.budgetedUnits / values.unitsPerHour;
  return { kind: 'derived', durationMinutes: toWholeMinutes(workingHours) };
}

/**
 * Format a whole-minute derived duration for display, on the calendar it will be measured against.
 *
 * `hoursPerDay` is **required and never defaulted** (ADR-0070): after ADR-0068 a day is a
 * per-calendar quantity, so there is no safe fallback — 24 reads a working day on an eight-hour
 * calendar as a third of one, and 8 does the reverse on a 24-hour one. `undefined` means the
 * calendar has genuinely not resolved yet, and the text degrades to hours and minutes rather than
 * inventing a factor.
 *
 * This used to divide by a flat 1440 and print decimal days ("1.5 days"). On an eight-hour calendar
 * that told a planner a one-working-day derivation was **"0.3 days"** — a number they read and
 * reason about before pressing Recalculate. It predated ADR-0070 and was not swept with the rest.
 * The output is now the same `d`/`h`/`m` grammar the duration field itself uses, so the preview and
 * the value it previews are spelled the same way; a second dialect for the same quantity is how a
 * planner ends up comparing "1.5 days" against "1d 4h" and trusting the wrong one.
 */
export function formatDerivedDuration(
  durationMinutes: number,
  hoursPerDay: number | undefined,
): string {
  return hoursPerDay === undefined
    ? formatWorkingMinutesNoDays(durationMinutes)
    : formatDurationText(durationMinutes, hoursPerDay);
}
