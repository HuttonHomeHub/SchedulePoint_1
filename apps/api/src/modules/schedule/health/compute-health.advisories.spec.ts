import { HEALTH_ADVISORY_IDS, HEALTH_METRIC_IDS } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeHealthReport, healthActivityAssignmentFields } from './compute-health';
import { activity, computeInput, dependency } from './health-fixtures';
import { OFFENDER_CAP } from './thresholds';

/**
 * **The advisory totality suite** (zero-duration-task M3-T1; ADR-0162 decision 2).
 *
 * The findings beyond the DCMA assessment are total over their own tuple exactly as the metrics are
 * over theirs: every advisory row is present on every plan state, in tuple order, with one shape.
 * FC-4 is pinned here too: the fourteen metrics and the summary do not know the advisory exists.
 */

const zero = (id: string, extra: Parameters<typeof activity>[0] = {}) =>
  activity({ id, code: id, name: `Zero ${id}`, durationMinutes: 0, ...extra });

const states = {
  'healthy scheduled plan, no zero-duration task': computeInput({
    activities: [activity({ id: 'a' }), activity({ id: 'b' })],
    dependencies: [dependency({ predecessorId: 'a', successorId: 'b' })],
  }),
  'never-calculated plan with a zero-duration task': computeInput({
    plan: { computedAt: null } as never,
    activities: [
      activity({ id: 'a', totalFloat: null, earlyStart: null, earlyFinish: null }),
      zero('z', { totalFloat: null, earlyStart: null, earlyFinish: null, hasAssignment: false }),
    ],
  }),
  'empty plan': computeInput({ activities: [] }),
  'plan with resourced and unresourced zero-duration tasks': computeInput({
    activities: [
      activity({ id: 'a' }),
      zero('z0', { hasAssignment: false }),
      zero('z1'),
      zero('z3', { assignmentCount: 3 }),
    ],
  }),
};

describe('advisories — totality and shape', () => {
  for (const [label, input] of Object.entries(states)) {
    it(`${label}: one row per advisory id, in tuple order, never assessable-or-not`, () => {
      const report = computeHealthReport(input);
      expect(report.advisories.map((a) => a.id)).toEqual([...HEALTH_ADVISORY_IDS]);
      for (const advisory of report.advisories) {
        expect(advisory.measured).not.toBeNull();
        expect(advisory.measured.ratio).toBeNull();
        expect(advisory.offenderCount).toBeGreaterThanOrEqual(advisory.offenders.length);
        expect(advisory.offendersTruncated).toBe(
          advisory.offenderCount > advisory.offenders.length,
        );
        expect(typeof advisory.detail.resourced).toBe('number');
      }
    });

    it(`${label}: FC-4 — 14 metrics, ids unchanged, and the summary counts only them`, () => {
      const report = computeHealthReport(input);
      expect(report.metrics.map((m) => m.id)).toEqual([...HEALTH_METRIC_IDS]);
      const s = report.summary;
      expect(s.passed + s.failed + s.notAssessable + s.informational).toBe(14);
    });
  }

  it('the id tuple and the metric tuple share no member', () => {
    const metrics = new Set<string>(HEALTH_METRIC_IDS);
    for (const id of HEALTH_ADVISORY_IDS) expect(metrics.has(id)).toBe(false);
  });
});

describe('advisories — the zero-duration tasks row', () => {
  it('counts zero-duration TASKs over the active non-summary activities, noting assignments', () => {
    const report = computeHealthReport(
      states['plan with resourced and unresourced zero-duration tasks'],
    );
    const row = report.advisories[0]!;
    expect(row.name).toBe('Zero-duration tasks');
    expect(row.measured).toEqual({ count: 3, denominator: 4, percent: 75, ratio: null });
    expect(row.offenders.map((o) => [o.id, o.note, o.activityId])).toEqual([
      ['z0', 'no resource assignment', 'z0'],
      ['z1', '1 resource assignment', 'z1'],
      ['z3', '3 resource assignments', 'z3'],
    ]);
    expect(row.detail).toEqual({ resourced: 2 });
  });

  it('is assessed on a plan never calculated (it reads stored durations)', () => {
    const row = computeHealthReport(states['never-calculated plan with a zero-duration task'])
      .advisories[0]!;
    expect(row.offenderCount).toBe(1);
  });

  it('reads "0 of 0" on an empty plan, never a reason', () => {
    const row = computeHealthReport(states['empty plan']).advisories[0]!;
    expect(row.measured).toEqual({ count: 0, denominator: 0, percent: 0, ratio: null });
    expect(row.offenders).toEqual([]);
  });

  it('ignores zero-duration milestones, levels of effort, summaries and resource-dependent rows', () => {
    const row = computeHealthReport(
      computeInput({
        activities: [
          activity({ id: 'fm', type: 'FINISH_MILESTONE', durationMinutes: 0 }),
          activity({ id: 'sm', type: 'START_MILESTONE', durationMinutes: 0 }),
          activity({ id: 'loe', type: 'LEVEL_OF_EFFORT', durationMinutes: 0 }),
          activity({ id: 'wbs', type: 'WBS_SUMMARY', durationMinutes: 0 }),
          activity({ id: 'rd', type: 'RESOURCE_DEPENDENT', durationMinutes: 0 }),
          activity({ id: 'long', durationMinutes: 480 }),
        ],
      }),
    ).advisories[0]!;
    expect(row.offenderCount).toBe(0);
    // The summary is excluded from the denominator, as it is from the metrics'.
    expect(row.measured.denominator).toBe(5);
  });

  it('caps the offender list at the report cap and keeps the true total', () => {
    const many = Array.from({ length: OFFENDER_CAP + 2 }, (_, i) => zero(`z${String(i)}`));
    const row = computeHealthReport(computeInput({ activities: many })).advisories[0]!;
    expect(row.offenders).toHaveLength(OFFENDER_CAP);
    expect(row.offenderCount).toBe(OFFENDER_CAP + 2);
    expect(row.offendersTruncated).toBe(true);
  });
});

describe('healthActivityAssignmentFields — one count, two readings (FC-7)', () => {
  it('derives presence from the count', () => {
    expect(healthActivityAssignmentFields(0)).toEqual({ hasAssignment: false, assignmentCount: 0 });
    expect(healthActivityAssignmentFields(2)).toEqual({ hasAssignment: true, assignmentCount: 2 });
  });
});
