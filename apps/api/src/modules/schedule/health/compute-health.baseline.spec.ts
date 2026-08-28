import { describe, expect, it } from 'vitest';

import { computeHealthReport } from './compute-health';
import { activity, baseline, computeInput } from './health-fixtures';

const metric = (input: ReturnType<typeof computeInput>, id: string) =>
  computeHealthReport(input).metrics.find((m) => m.id === id)!;

/** M1-T5 — the baseline-relative metrics (11, 13, 14) and metric 12's placeholder. */
describe('metric 11 — missed activities', () => {
  it('no active baseline is NO_ACTIVE_BASELINE', () => {
    expect(metric(computeInput({}), 'MISSED_ACTIVITIES').reason).toBe('NO_ACTIVE_BASELINE');
  });

  it('a baseline with nothing due is NOTHING_DUE, and absent activities are counted', () => {
    const input = computeInput({
      activities: [activity({ id: 'a' }), activity({ id: 'stranger' })],
      baseline: baseline({
        activities: [{ sourceActivityId: 'a', baselineFinish: '2026-09-01' }],
      }),
    });
    expect(metric(input, 'MISSED_ACTIVITIES').reason).toBe('NOTHING_DUE');
  });

  it('misses by actual finish AND by forecast finish; the stale-baseline count travels', () => {
    const input = computeInput({
      activities: [
        activity({
          id: 'late-actual',
          status: 'COMPLETE',
          actualStart: '2026-01-05',
          actualFinish: '2026-02-20',
        }),
        activity({ id: 'late-forecast', earlyFinish: '2026-03-20' }),
        activity({
          id: 'on-time',
          status: 'COMPLETE',
          actualStart: '2026-01-05',
          actualFinish: '2026-01-30',
        }),
        activity({ id: 'unbaselined' }),
      ],
      baseline: baseline({
        activities: [
          { sourceActivityId: 'late-actual', baselineFinish: '2026-02-01' },
          { sourceActivityId: 'late-forecast', baselineFinish: '2026-02-15' },
          { sourceActivityId: 'on-time', baselineFinish: '2026-02-01' },
        ],
      }),
    });
    const m = metric(input, 'MISSED_ACTIVITIES');
    expect(m.measured).toMatchObject({ count: 2, denominator: 3 });
    expect(m.detail).toMatchObject({ dueCount: 3, notInBaselineCount: 1 });
    expect(m.offenders.map((o) => o.id).sort()).toEqual(['late-actual', 'late-forecast']);
  });
});

describe('metric 13 — CPLI, and a target that is never invented', () => {
  it("uses the active baseline's captured project finish first", () => {
    const input = computeInput({
      activities: [activity({ earlyFinish: '2026-04-01' })],
      baseline: baseline({ capturedProjectFinish: '2026-04-11' }),
    });
    const m = metric(input, 'CPLI');
    // CPL = 30 (data date 03-02 → 04-01), float to target = 10 → CPLI = 40/30 ≈ 1.3333.
    expect(m.measured?.ratio).toBeCloseTo(1.3333, 4);
    expect(m.verdict).toBe('PASS');
    expect(m.detail).toMatchObject({ targetSource: 'ACTIVE_BASELINE', targetFinish: '2026-04-11' });
  });

  it('falls back to the EARLIEST hard finish constraint on a FINISH_MILESTONE, and names it', () => {
    const input = computeInput({
      activities: [
        activity({ earlyFinish: '2026-04-01' }),
        activity({
          id: 'ms-late',
          type: 'FINISH_MILESTONE',
          durationMinutes: 0,
          constraintType: 'FNLT',
          constraintDate: '2026-05-01',
        }),
        activity({
          id: 'ms-tight',
          type: 'FINISH_MILESTONE',
          durationMinutes: 0,
          constraintType: 'MFO',
          constraintDate: '2026-03-22',
        }),
      ],
    });
    const m = metric(input, 'CPLI');
    // Target = the tightest commitment (03-22): CPL 30, float −10 → CPLI 20/30 ≈ 0.6667 → FAIL.
    expect(m.detail).toMatchObject({
      targetSource: 'FINISH_MILESTONE_CONSTRAINT',
      targetMilestoneId: 'ms-tight',
    });
    expect(m.measured?.ratio).toBeCloseTo(0.6667, 4);
    expect(m.verdict).toBe('FAIL');
  });

  it('no baseline and no finish constraint is NO_TARGET_FINISH — a target is never invented', () => {
    expect(metric(computeInput({}), 'CPLI').reason).toBe('NO_TARGET_FINISH');
  });

  it('a plan already past its finish is NOTHING_REMAINING, never a division by zero', () => {
    const input = computeInput({
      activities: [activity({ earlyFinish: '2026-03-02' })],
      baseline: baseline({ capturedProjectFinish: '2026-04-11' }),
    });
    expect(metric(input, 'CPLI').reason).toBe('NOTHING_REMAINING');
  });
});

describe('metric 14 — BEI', () => {
  it('computes completed / due and lists the due-but-incomplete as offenders', () => {
    const input = computeInput({
      activities: [
        activity({
          id: 'done',
          status: 'COMPLETE',
          actualStart: '2026-01-05',
          actualFinish: '2026-02-01',
        }),
        activity({ id: 'not-done' }),
      ],
      baseline: baseline({
        activities: [
          { sourceActivityId: 'done', baselineFinish: '2026-02-01' },
          { sourceActivityId: 'not-done', baselineFinish: '2026-02-15' },
        ],
      }),
    });
    const m = metric(input, 'BEI');
    expect(m.measured?.ratio).toBe(0.5);
    expect(m.verdict).toBe('FAIL');
    expect(m.offenders.map((o) => o.id)).toEqual(['not-done']);
    expect(m.detail).toMatchObject({ completedCount: 1, dueCount: 2 });
  });

  it('nothing due yet is NOTHING_DUE, never Infinity', () => {
    const input = computeInput({
      activities: [activity({ id: 'a' })],
      baseline: baseline({
        activities: [{ sourceActivityId: 'a', baselineFinish: '2026-09-01' }],
      }),
    });
    expect(metric(input, 'BEI').reason).toBe('NOTHING_DUE');
  });
});

describe('metric 12 — the placeholder M6 must replace', () => {
  it('is NOT_ASSESSABLE / REQUIRES_WHAT_IF_ANALYSIS with threshold null', () => {
    // M6 (CQ-1 = (b)) computes this for real; it has to DELETE this failing assertion rather than
    // silently diverge from the placeholder — the plan's own pin.
    const m = metric(computeInput({}), 'CRITICAL_PATH_TEST');
    expect(m.verdict).toBe('NOT_ASSESSABLE');
    expect(m.reason).toBe('REQUIRES_WHAT_IF_ANALYSIS');
    expect(m.threshold).toBeNull();
  });
});
