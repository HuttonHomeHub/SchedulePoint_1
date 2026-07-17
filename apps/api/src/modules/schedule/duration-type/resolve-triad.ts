import type { DurationType, EditedField } from '@repo/types';

/**
 * The P6 duration-type recompute (M7 rung 4, ADR-0040; ADR-0035 §26/§27) — a **pure, I/O-free,
 * total** function that keeps the identity **`Units = Duration × Units/Time`** true after a planner
 * edits one of the three quantities.
 *
 * `D` = working **hours** (`durationMinutes / 60`), `U` = `budgetedUnits`, `R` = `unitsPerHour`, with
 * `U = D × R`. The activity's {@link DurationType} names which quantity is **held** and which is
 * **recomputed** for a given {@link EditedField}; the caller passes the triad with the edited field
 * already set to its new value and this returns the triad with the dependent recomputed:
 *
 * | Duration type                    | edit Duration | edit Units | edit Units/Time |
 * | -------------------------------- | ------------- | ---------- | --------------- |
 * | FIXED_UNITS                      | `R := U/D`    | `R := U/D` | `D := U/R`      |
 * | FIXED_UNITS_TIME                 | `U := D×R`    | `D := U/R` | `U := D×R`      |
 * | FIXED_DURATION_AND_UNITS         | `R := U/D`    | `R := U/D` | `U := D×R`      |
 * | FIXED_DURATION_AND_UNITS_TIME    | `U := D×R`    | `R := U/D` | `U := D×R`      |
 *
 * **Duration is auto-derived only under the two units-driven types** (`FIXED_UNITS`,
 * `FIXED_UNITS_TIME`) and only on the complementary edit; every other cell holds the duration.
 * `durationMinutes` is rounded **half-up to a whole minute** and clamped `≥ 0`; `budgetedUnits` and
 * `unitsPerHour` are rounded to `Decimal(18,4)`. So the identity holds to that grid — the recomputed
 * field is exact to its storage precision and the held fields are never silently changed (a
 * sub-minute residual on a *derived* duration is documented, not hidden — ADR-0040 (a)).
 *
 * **Totality (ADR-0040 (f)).** The function never yields NaN/Infinity/a negative duration:
 * - a **NULL rate** (`unitsPerHour === null`) means the triad is inert — returned unchanged (the
 *   ADR-0040 §4 parity no-op; the whole feature is dark until a rate is entered);
 * - a **zero rate** on a units-driven recompute (`D := U/R`) is rejected (`UNITS_PER_HOUR_ZERO`, N20)
 *   *before* any division — the caller maps it to a 422;
 * - a **zero duration** on a rate-recompute (`R := U/D`) cannot divide, so the rate is held (a
 *   zero-duration activity has no meaningful rate; the other cells still apply).
 */
export interface TriadInput {
  /** Post-edit working duration in whole minutes (ADR-0036), integer `≥ 0`. */
  durationMinutes: number;
  /** Post-edit budgeted units (`U`), `≥ 0`. */
  budgetedUnits: number;
  /** Post-edit rate in units per working hour (`R`), `≥ 0`, or `null` = no rate (triad inert). */
  unitsPerHour: number | null;
}

export type ResolveTriadResult =
  | { ok: true; durationMinutes: number; budgetedUnits: number; unitsPerHour: number | null }
  | { ok: false; reason: 'UNITS_PER_HOUR_ZERO' };

const MINUTES_PER_HOUR = 60;

/** Which field the given (type, editedField) recomputes — the truth table above. */
type Dependent = 'DURATION' | 'UNITS' | 'UNITS_PER_HOUR';

function dependentField(type: DurationType, edited: EditedField): Dependent {
  switch (type) {
    case 'FIXED_UNITS':
      // Units held; a rate edit derives the duration, otherwise the rate absorbs.
      return edited === 'UNITS_PER_HOUR' ? 'DURATION' : 'UNITS_PER_HOUR';
    case 'FIXED_UNITS_TIME':
      // Rate held; a units edit derives the duration, otherwise units absorb.
      return edited === 'UNITS' ? 'DURATION' : 'UNITS';
    case 'FIXED_DURATION_AND_UNITS':
      // Duration & units held; the rate always absorbs a rate edit, else the rate recomputes.
      return edited === 'UNITS_PER_HOUR' ? 'UNITS' : 'UNITS_PER_HOUR';
    case 'FIXED_DURATION_AND_UNITS_TIME':
      // Duration & rate held (the default); units absorb, except a units edit recomputes the rate.
      return edited === 'UNITS' ? 'UNITS_PER_HOUR' : 'UNITS';
  }
}

/** Round to whole minutes, half-up, clamped `≥ 0` (durations are non-negative). */
function roundMinutes(value: number): number {
  return Math.max(0, Math.round(value));
}

/** Round to `Decimal(18,4)` (four fractional digits) so the stored value matches the column. */
function round4(value: number): number {
  return Math.max(0, Math.round(value * 10000) / 10000);
}

/**
 * Recompute the triad's dependent field for `(durationType, editedField)`. See the module doc for
 * the table and the totality guarantees. The caller persists the returned `durationMinutes` /
 * `budgetedUnits` / `unitsPerHour`; the derived field is server-computed and overwrites any
 * client-supplied value (ADR-0040 (d)).
 */
export function resolveTriad(
  durationType: DurationType,
  editedField: EditedField,
  triad: TriadInput,
): ResolveTriadResult {
  const { durationMinutes, budgetedUnits: U, unitsPerHour: R } = triad;

  // NULL rate ⇒ triad inert ⇒ byte-parity (ADR-0040 §4): nothing is derived, duration stays as entered.
  if (R === null) {
    return { ok: true, durationMinutes, budgetedUnits: U, unitsPerHour: null };
  }

  const D = durationMinutes / MINUTES_PER_HOUR; // working hours
  const dependent = dependentField(durationType, editedField);

  switch (dependent) {
    case 'DURATION': {
      // D := U / R — the units-driven derivation. Zero rate can't divide (N20).
      if (R === 0) return { ok: false, reason: 'UNITS_PER_HOUR_ZERO' };
      const derivedMinutes = roundMinutes((U / R) * MINUTES_PER_HOUR);
      return { ok: true, durationMinutes: derivedMinutes, budgetedUnits: U, unitsPerHour: R };
    }
    case 'UNITS': {
      // U := D × R — always defined (no division).
      return { ok: true, durationMinutes, budgetedUnits: round4(D * R), unitsPerHour: R };
    }
    case 'UNITS_PER_HOUR': {
      // R := U / D — a zero-duration activity has no rate to recompute; hold R (can't divide by 0).
      if (durationMinutes === 0) {
        return { ok: true, durationMinutes, budgetedUnits: U, unitsPerHour: R };
      }
      return { ok: true, durationMinutes, budgetedUnits: U, unitsPerHour: round4(U / D) };
    }
  }
}
