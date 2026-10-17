import { describe, expect, it } from 'vitest';

import { constraintsPlan } from '../../../../../seed-cli/src/capabilities/constraints';
import { specToEngineInput } from '../../../../test/pairwise/spec-to-engine';

import { computeSchedule } from './compute';

/**
 * The seeded `C_NONWORK` case must be able to fail (`docs/TECH_DEBT.md` #350). It exists to prove a
 * constraint dated on a non-working day resolves to a working instant, which is only a statement
 * about the engine if the plan has a weekend: on the all-minutes calendar the Saturday is an
 * ordinary working day, the SNET lands on it untouched, and the case passes against an engine that
 * resolves nothing. The dates below were read from `computeSchedule` over the spec, not computed
 * by hand.
 */
describe('seed catalogue: capability-constraints C_NONWORK', () => {
  const spec = constraintsPlan();
  const input = specToEngineInput(spec);
  const results = computeSchedule(input.activities, input.edges, input.options).results;
  const byKey = new Map(results.map((r) => [r.activityId, r]));

  it('is dated on a Saturday, on a plan whose calendar has no Saturday', () => {
    const activity = spec.activities.find((a) => a.key === 'C_NONWORK');
    expect(activity?.constraintDate).toBe('2026-03-21');
    expect(new Date('2026-03-21T00:00:00Z').getUTCDay()).toBe(6);

    const calendar = spec.calendars.find((c) => c.key === spec.plan.defaultCalendarKey);
    expect(calendar).toBeDefined();
    const saturday = calendar?.days.find((day) => day.weekday === 6);
    expect(saturday?.windows).toEqual([]);
  });

  it('starts on the Monday after the weekend, not on the Saturday', () => {
    expect(byKey.get('C_NONWORK')?.earlyStart.slice(0, 10)).toBe('2026-03-23');
  });
});
