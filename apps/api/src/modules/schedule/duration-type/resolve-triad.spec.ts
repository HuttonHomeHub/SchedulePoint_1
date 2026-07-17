import type { DurationType, EditedField } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { resolveTriad, type TriadInput } from './resolve-triad';

/**
 * Exhaustive goldens for the P6 duration-type recompute (ADR-0040 / ADR-0035 §26/§27). Every one of
 * the 4 duration types × 3 edited fields = 12 cells is asserted against first-principles arithmetic
 * (no external oracle, ADR-0034), plus the rounding rule, the N20 zero-rate reject, the NULL-rate
 * parity no-op, the zero-duration edge, and a property test of the `U = D × R` identity.
 *
 * Convention: the input triad already carries the planner's NEW value for the edited field; the
 * function recomputes the dependent. `D` = `durationMinutes / 60` working hours.
 */
function ok(result: ReturnType<typeof resolveTriad>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result;
}

describe('resolveTriad — the 12-cell truth table (ADR-0035 §26)', () => {
  // Each case: the post-edit triad, and the expected recomputed dependent. Baselines chosen so the
  // arithmetic is exact: D = 10 h (600 min) or 20 h (1200 min), U = 40/80, R = 2/4/8, U = D×R.
  const cases: Array<{
    type: DurationType;
    edited: EditedField;
    input: TriadInput;
    expect: TriadInput;
    note: string;
  }> = [
    // FIXED_UNITS — units held; rate edit derives duration, else rate absorbs.
    {
      type: 'FIXED_UNITS',
      edited: 'DURATION',
      input: { durationMinutes: 1200, budgetedUnits: 40, unitsPerHour: 4 },
      expect: { durationMinutes: 1200, budgetedUnits: 40, unitsPerHour: 2 }, // R := 40/20
      note: 'edit D ⇒ R := U/D',
    },
    {
      type: 'FIXED_UNITS',
      edited: 'UNITS',
      input: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 4 },
      expect: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 8 }, // R := 80/10
      note: 'edit U ⇒ R := U/D',
    },
    {
      type: 'FIXED_UNITS',
      edited: 'UNITS_PER_HOUR',
      input: { durationMinutes: 600, budgetedUnits: 40, unitsPerHour: 8 },
      expect: { durationMinutes: 300, budgetedUnits: 40, unitsPerHour: 8 }, // D := 40/8 = 5h
      note: 'edit R ⇒ D := U/R (duration derives)',
    },
    // FIXED_UNITS_TIME — rate held; units edit derives duration, else units absorb.
    {
      type: 'FIXED_UNITS_TIME',
      edited: 'DURATION',
      input: { durationMinutes: 1200, budgetedUnits: 40, unitsPerHour: 4 },
      expect: { durationMinutes: 1200, budgetedUnits: 80, unitsPerHour: 4 }, // U := 20×4
      note: 'edit D ⇒ U := D×R',
    },
    {
      type: 'FIXED_UNITS_TIME',
      edited: 'UNITS',
      input: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 4 },
      expect: { durationMinutes: 1200, budgetedUnits: 80, unitsPerHour: 4 }, // D := 80/4 = 20h
      note: 'edit U ⇒ D := U/R (duration derives)',
    },
    {
      type: 'FIXED_UNITS_TIME',
      edited: 'UNITS_PER_HOUR',
      input: { durationMinutes: 600, budgetedUnits: 40, unitsPerHour: 8 },
      expect: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 8 }, // U := 10×8
      note: 'edit R ⇒ U := D×R',
    },
    // FIXED_DURATION_AND_UNITS — duration & units held; rate absorbs.
    {
      type: 'FIXED_DURATION_AND_UNITS',
      edited: 'DURATION',
      input: { durationMinutes: 1200, budgetedUnits: 40, unitsPerHour: 4 },
      expect: { durationMinutes: 1200, budgetedUnits: 40, unitsPerHour: 2 }, // R := 40/20
      note: 'edit D ⇒ R := U/D',
    },
    {
      type: 'FIXED_DURATION_AND_UNITS',
      edited: 'UNITS',
      input: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 4 },
      expect: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 8 }, // R := 80/10
      note: 'edit U ⇒ R := U/D',
    },
    {
      type: 'FIXED_DURATION_AND_UNITS',
      edited: 'UNITS_PER_HOUR',
      input: { durationMinutes: 600, budgetedUnits: 40, unitsPerHour: 8 },
      expect: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 8 }, // U := 10×8
      note: 'edit R ⇒ U := D×R',
    },
    // FIXED_DURATION_AND_UNITS_TIME (default) — duration & rate held; units absorb, units edit → rate.
    {
      type: 'FIXED_DURATION_AND_UNITS_TIME',
      edited: 'DURATION',
      input: { durationMinutes: 1200, budgetedUnits: 40, unitsPerHour: 4 },
      expect: { durationMinutes: 1200, budgetedUnits: 80, unitsPerHour: 4 }, // U := 20×4
      note: 'edit D ⇒ U := D×R',
    },
    {
      type: 'FIXED_DURATION_AND_UNITS_TIME',
      edited: 'UNITS_PER_HOUR',
      input: { durationMinutes: 600, budgetedUnits: 40, unitsPerHour: 8 },
      expect: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 8 }, // U := 10×8
      note: 'edit R ⇒ U := D×R',
    },
    {
      type: 'FIXED_DURATION_AND_UNITS_TIME',
      edited: 'UNITS',
      input: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 4 },
      expect: { durationMinutes: 600, budgetedUnits: 80, unitsPerHour: 8 }, // R := 80/10
      note: 'edit U ⇒ R := U/D',
    },
  ];

  it.each(cases)('$type · $note', ({ type, edited, input, expect: want }) => {
    const result = ok(resolveTriad(type, edited, input));
    expect(result.durationMinutes).toBe(want.durationMinutes);
    expect(result.budgetedUnits).toBe(want.budgetedUnits);
    expect(result.unitsPerHour).toBe(want.unitsPerHour);
  });

  it('covers all 12 cells', () => {
    expect(cases).toHaveLength(12);
  });
});

describe('resolveTriad — rounding, guards, and parity', () => {
  it('rounds a derived duration half-up to whole minutes', () => {
    // FIXED_UNITS edit rate: D := U/R = 1/7 h = 8.571… min → 9.
    const r = ok(
      resolveTriad('FIXED_UNITS', 'UNITS_PER_HOUR', {
        durationMinutes: 600,
        budgetedUnits: 1,
        unitsPerHour: 7,
      }),
    );
    expect(r.durationMinutes).toBe(9);
    expect(r.unitsPerHour).toBe(7);
    expect(r.budgetedUnits).toBe(1);
  });

  it('rounds a derived units/rate to Decimal(18,4)', () => {
    // FIXED_UNITS edit units: R := U/D = 100/(10h) = 10 exact; use a repeating case for the round.
    const r = ok(
      resolveTriad('FIXED_UNITS', 'UNITS', {
        durationMinutes: 420, // 7 h
        budgetedUnits: 10,
        unitsPerHour: 1,
      }),
    );
    // R := 10 / 7 = 1.428571… → 1.4286 (4 dp).
    expect(r.unitsPerHour).toBe(1.4286);
  });

  it('rejects a zero rate on a units-driven recompute (N20)', () => {
    // FIXED_UNITS edit rate ⇒ D := U/R; R = 0 would divide by zero.
    const r = resolveTriad('FIXED_UNITS', 'UNITS_PER_HOUR', {
      durationMinutes: 600,
      budgetedUnits: 40,
      unitsPerHour: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('UNITS_PER_HOUR_ZERO');
  });

  it('allows a zero rate when it is NOT a divisor (U := D×R)', () => {
    // FIXED_DURATION_AND_UNITS_TIME edit duration ⇒ U := D×R; R=0 just yields U=0, no division.
    const r = ok(
      resolveTriad('FIXED_DURATION_AND_UNITS_TIME', 'DURATION', {
        durationMinutes: 600,
        budgetedUnits: 40,
        unitsPerHour: 0,
      }),
    );
    expect(r.durationMinutes).toBe(600);
    expect(r.budgetedUnits).toBe(0);
    expect(r.unitsPerHour).toBe(0);
  });

  it('is a no-op when the rate is null (triad inert — the parity gate)', () => {
    for (const type of [
      'FIXED_UNITS',
      'FIXED_UNITS_TIME',
      'FIXED_DURATION_AND_UNITS',
      'FIXED_DURATION_AND_UNITS_TIME',
    ] as const) {
      for (const edited of ['DURATION', 'UNITS', 'UNITS_PER_HOUR'] as const) {
        const input = { durationMinutes: 777, budgetedUnits: 12.34, unitsPerHour: null };
        const r = ok(resolveTriad(type, edited, input));
        expect(r).toMatchObject(input);
      }
    }
  });

  it('holds the rate for a zero-duration activity (no duration to divide by)', () => {
    // FIXED_UNITS edit units ⇒ R := U/D, but D = 0 → rate held (can't divide), duration stays 0.
    const r = ok(
      resolveTriad('FIXED_UNITS', 'UNITS', {
        durationMinutes: 0,
        budgetedUnits: 40,
        unitsPerHour: 4,
      }),
    );
    expect(r).toMatchObject({ durationMinutes: 0, budgetedUnits: 40, unitsPerHour: 4 });
  });
});

describe('resolveTriad — the identity U = D × R holds after every resolve', () => {
  it('keeps U ≈ (durationMinutes/60) × R within the rounding grid', () => {
    const types = [
      'FIXED_UNITS',
      'FIXED_UNITS_TIME',
      'FIXED_DURATION_AND_UNITS',
      'FIXED_DURATION_AND_UNITS_TIME',
    ] as const;
    const edits = ['DURATION', 'UNITS', 'UNITS_PER_HOUR'] as const;
    for (const type of types) {
      for (const edited of edits) {
        for (const durationMinutes of [30, 137, 600, 941, 2000]) {
          for (const budgetedUnits of [1, 7.5, 40, 123.45]) {
            for (const unitsPerHour of [0.5, 3, 8.25]) {
              const r = resolveTriad(type, edited, {
                durationMinutes,
                budgetedUnits,
                unitsPerHour,
              });
              if (!r.ok) continue; // N20 cases have no identity to assert
              const D = r.durationMinutes / 60;
              const lhs = r.budgetedUnits;
              const rhs = D * (r.unitsPerHour ?? 0);
              // Derived-duration cells round to a whole minute; the residual is ≤ half a minute of rate.
              const tolerance = (r.unitsPerHour ?? 0) / 120 + 0.0001;
              expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(tolerance);
            }
          }
        }
      }
    }
  });
});
