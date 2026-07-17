import { describe, expect, it } from 'vitest';

import { computeSchedule, levelSchedule } from '../engine';

import { GOLDEN_CASES, LEVELLING_GOLDEN_CASES } from './goldens';

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

/**
 * First-principles resource-**levelling** goldens (ADR-0034 §3 / ADR-0041). Each runs the pure network
 * pass, then the opt-in {@link levelSchedule} second pass, and asserts the leveled overlay against
 * hand-computed offsets/dates — the reproducible oracle for the serial priority-list heuristic
 * (independent of the fixture; ADR-0034's no-external-oracle strategy).
 */
describe('engine resource-levelling goldens (first-principles)', () => {
  for (const golden of LEVELLING_GOLDEN_CASES) {
    describe(`${golden.name} — ${golden.description}`, () => {
      const network = computeSchedule(golden.activities, golden.edges, golden.options);
      const leveled = levelSchedule(
        golden.activities,
        network,
        golden.assignments,
        golden.resources,
        {
          levelWithinFloatOnly: golden.levelWithinFloatOnly,
          dataDate: golden.options.dataDate,
          planCalendar: golden.options.calendar,
        },
      );
      const byId = new Map(leveled.results.map((r) => [r.activityId, r]));

      for (const [id, expected] of Object.entries(golden.expected)) {
        it(`levels ${id} to its hand-computed leveled overlay`, () => {
          const result = byId.get(id);
          expect(result, `no result for ${id}`).toBeDefined();
          expect({
            leveledStartOffset: result!.leveledStartOffset,
            leveledFinishOffset: result!.leveledFinishOffset,
            leveledStart: result!.leveledStart,
            leveledFinish: result!.leveledFinish,
            levelingDelay: result!.levelingDelay,
          }).toEqual(expected);
        });
      }

      it('rolls up the expected leveled project finish', () => {
        expect(leveled.summary.leveledProjectFinish).toBe(golden.leveledProjectFinish);
      });
    });
  }
});
