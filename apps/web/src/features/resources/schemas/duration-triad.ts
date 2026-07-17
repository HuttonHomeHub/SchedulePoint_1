import type { DurationType, EditedField } from '@repo/types';

/**
 * Client-side preview of the **duration-type triad** (M7 rung 4, ADR-0040) — narrowly the one
 * user-visible cross-resource effect: editing a driving assignment's units/rate can **derive the
 * owning activity's duration**. This mirrors the server's pure `resolveTriad`
 * (`apps/api/.../duration-type/resolve-triad.ts`) for that single case so the assignment editor can
 * show "this will set the duration to N days" before the write. The **server remains authoritative** —
 * it recomputes and persists the real value, which the UI refetches; this is a hint, not the source of
 * truth, so it deliberately covers only the derive-duration branch (the non-duration recomputes just
 * move a same-row Units/Rate the server returns).
 *
 * Duration derives (`D := Units ÷ Units/Time`) only under the two **units-driven** types on the
 * complementary edit (ADR-0035 §26 truth table): `FIXED_UNITS` on a rate edit, `FIXED_UNITS_TIME` on a
 * units edit. Every other (type, edited) pair holds the duration — the preview returns `null` for them.
 */

/** Minutes in an hour / a working day — must match the engine (ADR-0036: `MINUTES_PER_DAY = 1440`). */
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

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
 * Format a whole-minute duration as working days for display — an integer when it lands on a whole day,
 * else one decimal place (a derived duration need not be a whole number of days). Matches the "working
 * days" unit the activity form edits in.
 */
export function formatDurationDays(durationMinutes: number): string {
  const days = durationMinutes / MINUTES_PER_DAY;
  const rounded = Math.round(days * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'day' : 'days'}`;
}
