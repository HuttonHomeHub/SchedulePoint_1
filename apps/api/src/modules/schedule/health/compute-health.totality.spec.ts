import { HEALTH_METRIC_IDS } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeHealthReport } from './compute-health';
import { activity, baseline, computeInput, dependency } from './health-fixtures';
import { HEALTH_METRICS, THRESHOLDS } from './thresholds';

/**
 * The M1-T1 totality suite: the report is always exactly fourteen rows, one per metric id, in
 * ordinal order — and every row satisfies the verdict discriminator table (spec §4.5), cell by
 * cell. The table lives HERE rather than in fourteen evaluators' heads, which is how a printed
 * report ends up claiming a plan has zero missing-logic findings when the truth is that nobody
 * could count them.
 */
describe('health M1-T1 — totality and the verdict discriminator', () => {
  it('THRESHOLDS covers exactly the metric id union', () => {
    expect(Object.keys(THRESHOLDS).sort()).toEqual([...HEALTH_METRIC_IDS].sort());
  });

  it('HEALTH_METRICS is the id tuple in order, ordinals 1..14', () => {
    expect(HEALTH_METRICS.map((m) => m.id)).toEqual([...HEALTH_METRIC_IDS]);
    expect(HEALTH_METRICS.map((m) => m.ordinal)).toEqual(HEALTH_METRIC_IDS.map((_, i) => i + 1));
  });

  // A matrix of plan states wide enough that every verdict occurs at least once somewhere.
  const states = {
    'healthy scheduled plan': computeInput({
      activities: [activity({ id: 'a' }), activity({ id: 'b' })],
      dependencies: [dependency({ predecessorId: 'a', successorId: 'b' })],
    }),
    'never-calculated plan': computeInput({
      plan: { computedAt: null } as never,
      activities: [activity({ id: 'a', totalFloat: null, earlyStart: null, earlyFinish: null })],
    }),
    'empty plan': computeInput({ activities: [] }),
    'plan with a baseline and offences': computeInput({
      activities: [
        activity({ id: 'a', totalFloat: 61, hasAssignment: false }),
        activity({ id: 'b', totalFloat: -3, constraintType: 'MFO', constraintDate: '2026-04-01' }),
      ],
      dependencies: [
        dependency({ predecessorId: 'a', successorId: 'b', lagMinutes: -120, type: 'SS' }),
      ],
      baseline: baseline({
        capturedProjectFinish: '2026-06-01',
        activities: [{ sourceActivityId: 'a', baselineFinish: '2026-02-01' }],
      }),
    }),
  };

  for (const [label, input] of Object.entries(states)) {
    it(`${label}: 14 rows, ordinal order, discriminator holds row by row`, () => {
      const report = computeHealthReport(input);
      expect(report.metrics.map((m) => m.id)).toEqual([...HEALTH_METRIC_IDS]);
      expect(report.metrics.map((m) => m.ordinal)).toEqual(HEALTH_METRIC_IDS.map((_, i) => i + 1));

      for (const m of report.metrics) {
        // reason non-null IFF NOT_ASSESSABLE — deliberate redundancy, asserted.
        expect(m.reason !== null, `${m.id} reason/verdict`).toBe(m.verdict === 'NOT_ASSESSABLE');
        switch (m.verdict) {
          case 'NOT_ASSESSABLE':
            expect(m.measured, `${m.id} measured`).toBeNull();
            expect(m.detail, `${m.id} detail`).toBeNull();
            expect(m.offenders, `${m.id} offenders`).toEqual([]);
            expect(m.offenderCount, `${m.id} offenderCount`).toBe(0);
            expect(m.offendersTruncated, `${m.id} offendersTruncated`).toBe(false);
            break;
          case 'PASS':
            expect(m.measured, `${m.id} measured`).not.toBeNull();
            expect(m.threshold, `${m.id} threshold`).not.toBeNull();
            expect(m.offenders, `${m.id} offenders`).toEqual([]);
            expect(m.offenderCount, `${m.id} offenderCount`).toBe(0);
            break;
          case 'FAIL':
            expect(m.measured, `${m.id} measured`).not.toBeNull();
            expect(m.threshold, `${m.id} threshold`).not.toBeNull();
            expect(m.offenderCount, `${m.id} offenderCount`).toBeGreaterThan(0);
            break;
          case 'INFORMATIONAL':
            expect(m.measured, `${m.id} measured`).not.toBeNull();
            expect(m.threshold, `${m.id} threshold`).toBeNull();
            break;
        }
        // The cap contract: the listed offenders never exceed the cap, and truncation is honest.
        expect(m.offenders.length, `${m.id} cap`).toBeLessThanOrEqual(report.offenderCap);
        expect(m.offendersTruncated, `${m.id} truncated`).toBe(
          m.offenderCount > report.offenderCap,
        );
      }

      const s = report.summary;
      expect(s.passed + s.failed + s.notAssessable + s.informational).toBe(14);
    });
  }

  it('every verdict occurs at least once across the matrix (the matrix is not vacuous)', () => {
    const seen = new Set(
      Object.values(states)
        .flatMap((input) => computeHealthReport(input).metrics)
        .map((m) => m.verdict),
    );
    expect([...seen].sort()).toEqual(['FAIL', 'INFORMATIONAL', 'NOT_ASSESSABLE', 'PASS']);
  });
});
