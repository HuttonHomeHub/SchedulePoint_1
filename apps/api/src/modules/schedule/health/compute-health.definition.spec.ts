import { describe, expect, it } from 'vitest';

import { computeHealthReport } from './compute-health';
import { activity, computeInput, dependency } from './health-fixtures';

const metric = (input: ReturnType<typeof computeInput>, id: string) =>
  computeHealthReport(input).metrics.find((m) => m.id === id)!;

/** M1-T3 — the six definition metrics (1–5, 10), computable on a never-calculated plan. */
describe('metric 1 — missing logic and the CQ-3 typed rule', () => {
  it('a START_MILESTONE with no predecessor is excused; one WITH a predecessor is not', () => {
    const input = computeInput({
      activities: [
        activity({ id: 'open', type: 'START_MILESTONE', durationMinutes: 0 }),
        activity({ id: 'linked', type: 'START_MILESTONE', durationMinutes: 0 }),
        activity({ id: 'mid' }),
        activity({ id: 'end', type: 'FINISH_MILESTONE', durationMinutes: 0 }),
      ],
      dependencies: [
        dependency({ predecessorId: 'mid', successorId: 'linked' }),
        dependency({ predecessorId: 'linked', successorId: 'end' }),
        dependency({ predecessorId: 'open', successorId: 'mid' }),
      ],
    });
    const m = metric(input, 'MISSING_LOGIC');
    // 'open' is excused (open start); 'linked' has a pred so nothing to excuse; 'end' excused
    // (open finish). Every activity has logic on its unexcused side → zero offenders.
    expect(m.verdict).toBe('PASS');
    expect(m.detail).toMatchObject({
      exclusionRule: 'SUMMARIES_AND_TERMINAL_MILESTONES',
      excludedActivityIds: ['open', 'end'],
    });
  });

  it('a TASK with no predecessor is never excused, however early it sorts', () => {
    const input = computeInput({
      activities: [activity({ id: 'a-first' }), activity({ id: 'b' })],
      dependencies: [dependency({ predecessorId: 'a-first', successorId: 'b' })],
    });
    const m = metric(input, 'MISSING_LOGIC');
    // 'a-first' has no predecessor and no successor-side problem; it is an offender (no pred),
    // and 'b' is an offender (no succ): 2 of 2 → FAIL, and the rejected positional rule is pinned.
    expect(m.verdict).toBe('FAIL');
    expect(m.offenders.map((o) => o.id)).toContain('a-first');
    expect(m.detail).toMatchObject({ missingPredecessor: 1, missingSuccessor: 1 });
  });

  it('summaries are excluded from the denominator and counted in the detail', () => {
    const input = computeInput({
      activities: [
        activity({ id: 's1', type: 'WBS_SUMMARY' }),
        activity({ id: 'a' }),
        activity({ id: 'b' }),
      ],
      dependencies: [dependency({ predecessorId: 'a', successorId: 'b' })],
    });
    const m = metric(input, 'MISSING_LOGIC');
    expect(m.measured?.denominator).toBe(2);
    expect(m.detail).toMatchObject({ excludedSummaries: 1 });
  });

  it('a plan of only summaries is EMPTY_PLAN', () => {
    const input = computeInput({ activities: [activity({ type: 'WBS_SUMMARY' })] });
    const m = metric(input, 'MISSING_LOGIC');
    expect(m.verdict).toBe('NOT_ASSESSABLE');
    expect(m.reason).toBe('EMPTY_PLAN');
  });
});

describe('metrics 2 and 3 — leads and lags, in minutes', () => {
  it('a −1-minute lag is a lead (the rounded lagDays would say 0 — ADR-0070)', () => {
    const input = computeInput({
      activities: [activity({ id: 'a' }), activity({ id: 'b' })],
      dependencies: [dependency({ predecessorId: 'a', successorId: 'b', lagMinutes: -1 })],
    });
    const m = metric(input, 'LEADS');
    expect(m.verdict).toBe('FAIL');
    expect(m.measured).toMatchObject({ count: 1, denominator: null, percent: null });
    expect(m.offenders[0]).toMatchObject({ kind: 'RELATIONSHIP', activityId: 'b' });
  });

  it('a −120-minute lead is counted and named in minutes', () => {
    const input = computeInput({
      activities: [activity({ id: 'a' }), activity({ id: 'b' })],
      dependencies: [
        dependency({ predecessorId: 'a', successorId: 'b', lagMinutes: -120, type: 'SS' }),
      ],
    });
    expect(metric(input, 'LEADS').offenders[0]!.note).toBe('lead of -120 min (SS)');
  });

  it('lags: exactly 5 % passes, above fails', () => {
    const acts = Array.from({ length: 21 }, (_, i) => activity({ id: `a${i}` }));
    const atBoundary = computeInput({
      activities: acts,
      dependencies: [
        ...Array.from({ length: 19 }, (_, i) =>
          dependency({ predecessorId: `a${i}`, successorId: `a${i + 1}` }),
        ),
        dependency({ predecessorId: 'a19', successorId: 'a20', lagMinutes: 480 }),
      ],
    });
    // 1 of 20 = 5.0 % → PASS at the boundary.
    expect(metric(atBoundary, 'LAGS').verdict).toBe('PASS');
  });

  it('no relationships at all is NO_RELATIONSHIPS, not a pass', () => {
    const input = computeInput({ dependencies: [] });
    expect(metric(input, 'LEADS').reason).toBe('NO_RELATIONSHIPS');
    expect(metric(input, 'LAGS').reason).toBe('NO_RELATIONSHIPS');
    expect(metric(input, 'RELATIONSHIP_TYPES').reason).toBe('NO_RELATIONSHIPS');
  });
});

describe('metric 4 — relationship types', () => {
  it('reports the full breakdown and fails below 90 % FS', () => {
    const input = computeInput({
      activities: [activity({ id: 'a' }), activity({ id: 'b' }), activity({ id: 'c' })],
      dependencies: [
        dependency({ predecessorId: 'a', successorId: 'b', type: 'FS' }),
        dependency({ predecessorId: 'b', successorId: 'c', type: 'SF' }),
      ],
    });
    const m = metric(input, 'RELATIONSHIP_TYPES');
    expect(m.verdict).toBe('FAIL'); // 50 % FS
    expect(m.detail).toMatchObject({ breakdown: { fs: 1, ss: 0, ff: 0, sf: 1 } });
    // SF is called out — the playbook's "least-used type, easiest to get silently wrong".
    expect(m.offenders[0]!.note).toContain('SF');
  });
});

describe('metric 5 — hard constraints', () => {
  it('two hard constraints on one activity count once; a secondary FNLT counts', () => {
    const input = computeInput({
      activities: [
        activity({
          id: 'both',
          constraintType: 'MSO',
          constraintDate: '2026-04-01',
          secondaryConstraintType: 'FNLT',
          secondaryConstraintDate: '2026-05-01',
        }),
        activity({
          id: 'secondary-only',
          secondaryConstraintType: 'FNLT',
          secondaryConstraintDate: '2026-05-01',
        }),
        ...Array.from({ length: 38 }, (_, i) => activity({ id: `f${i}` })),
      ],
    });
    const m = metric(input, 'HARD_CONSTRAINTS');
    // 2 of 40 = 5.0 % → PASS at the boundary; both offenders present, 'both' once.
    expect(m.measured).toMatchObject({ count: 2, denominator: 40, percent: 5 });
    expect(m.verdict).toBe('PASS');
  });

  it('SNET and FNET are soft and never counted', () => {
    const input = computeInput({
      activities: [
        activity({ id: 'soft1', constraintType: 'SNET', constraintDate: '2026-04-01' }),
        activity({ id: 'soft2', constraintType: 'FNET', constraintDate: '2026-04-01' }),
      ],
    });
    expect(metric(input, 'HARD_CONSTRAINTS').measured?.count).toBe(0);
  });
});

describe('metric 10 — resources, narrowed and informational', () => {
  it('is INFORMATIONAL with threshold null and the narrowing named', () => {
    const input = computeInput({
      activities: [activity({ hasAssignment: false }), activity({ hasAssignment: true })],
    });
    const m = metric(input, 'RESOURCES');
    expect(m.verdict).toBe('INFORMATIONAL');
    expect(m.threshold).toBeNull();
    expect(m.detail).toMatchObject({ narrowing: 'RESOURCE_ASSIGNMENT_ONLY' });
    expect(m.measured).toMatchObject({ count: 1, denominator: 2 });
  });

  it('milestones never enter the denominator (duration 0 by construction)', () => {
    const input = computeInput({
      activities: [
        activity({ type: 'START_MILESTONE', durationMinutes: 0, hasAssignment: false }),
        activity({ hasAssignment: true }),
      ],
    });
    expect(metric(input, 'RESOURCES').measured?.denominator).toBe(1);
  });
});
