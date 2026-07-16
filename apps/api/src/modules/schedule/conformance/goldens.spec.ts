import { describe, expect, it } from 'vitest';

import { computeSchedule } from '../engine';

import { GOLDEN_CASES } from './goldens';

/**
 * First-principles golden assertions (ADR-0034 §3) — the engine's oracle-free
 * regression floor and the safety net ADR-0036 §3 names for the M1 days→minutes
 * rework. Each case's dates were hand-computed from ADR-0023 arithmetic; a change
 * to any of them is a deliberate, reviewed re-baseline, never a silent drift.
 */
describe('engine golden networks (first-principles)', () => {
  for (const golden of GOLDEN_CASES) {
    describe(`${golden.name} — ${golden.description}`, () => {
      const output = computeSchedule(golden.activities, golden.edges, golden.options);
      const byId = new Map(output.results.map((r) => [r.activityId, r]));

      for (const [id, expected] of Object.entries(golden.expected)) {
        it(`schedules ${id} to its hand-computed dates`, () => {
          const result = byId.get(id);
          expect(result, `no result for ${id}`).toBeDefined();
          expect({
            earlyStart: result!.earlyStart,
            earlyFinish: result!.earlyFinish,
            lateStart: result!.lateStart,
            lateFinish: result!.lateFinish,
            totalFloat: result!.totalFloat,
            isCritical: result!.isCritical,
            // Free float is compared only when the case pins it (M6-F1/F5), so existing cases stay exact.
            ...(expected.freeFloat !== undefined ? { freeFloat: result!.freeFloat } : {}),
          }).toEqual(expected);
        });
      }

      it('rolls up the expected project finish', () => {
        expect(output.summary.projectFinish).toBe(golden.projectFinish);
        expect(output.summary.activityCount).toBe(Object.keys(golden.expected).length);
      });
    });
  }
});
