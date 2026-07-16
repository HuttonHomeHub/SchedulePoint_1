import type { ActivitySummary, DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  activityBarLabel,
  activityLabel,
  announceChainStep,
  chainNeighbour,
  describeActivity,
  summarizeLogic,
} from './a11y';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('activityLabel / activityBarLabel (shared identity)', () => {
  it('prefixes the code when set, else uses the name alone', () => {
    expect(activityLabel(activity({ code: 'A1020', name: 'Erect steel' }))).toBe(
      'A1020 Erect steel',
    );
    expect(activityLabel(activity({ code: null, name: 'Erect steel' }))).toBe('Erect steel');
  });

  it('appends the working-day duration for a task, but not for a zero-duration milestone', () => {
    expect(
      activityBarLabel(activity({ code: 'A1020', name: 'Erect steel', durationDays: 5 })),
    ).toBe('A1020 Erect steel · 5d');
    expect(
      activityBarLabel(
        activity({ code: 'M1', name: 'Handover', type: 'FINISH_MILESTONE', durationDays: 0 }),
      ),
    ).toBe('M1 Handover');
  });

  it('keeps the identity a leading substring of both the bar label and the accessible name (label-in-name)', () => {
    const a = activity({ code: 'A1020', name: 'Erect steel', durationDays: 5 });
    const identity = activityLabel(a);
    expect(activityBarLabel(a).startsWith(identity)).toBe(true);
    expect(describeActivity(a).startsWith(identity)).toBe(true);
  });
});

function edge(
  over: Partial<DependencySummary> & Pick<DependencySummary, 'predecessor' | 'successor'>,
): DependencySummary {
  return {
    id: `${over.predecessor.id}->${over.successor.id}`,
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}
const ep = (id: string, name: string) => ({ id, code: null, name });

describe('describeActivity (Tier 1)', () => {
  it('names an uncomputed activity with its duration, as not scheduled, and nothing more', () => {
    expect(describeActivity(activity({ earlyStart: null }))).toBe(
      'Excavate, 3 working days, not yet scheduled',
    );
  });

  it('prefixes the code and gives duration + a date range + lane (1-based)', () => {
    expect(describeActivity(activity({ code: 'A100', laneIndex: 2 }))).toBe(
      'A100 Excavate, 3 working days, 01 Jan 2026 to 03 Jan 2026, lane 3, 0 days float',
    );
  });

  it('speaks the working-day duration (singular for one day) and omits it for a zero-duration milestone', () => {
    expect(describeActivity(activity({ durationDays: 1 }))).toContain('Excavate, 1 working day,');
    expect(describeActivity(activity({ type: 'FINISH_MILESTONE', durationDays: 0 }))).not.toContain(
      'working day',
    );
  });

  it('collapses a single-day span to one date', () => {
    expect(describeActivity(activity({ earlyFinish: '2026-01-01', totalFloat: 5 }))).toContain(
      '1 Jan 2026, lane 1, 5 days float',
    );
  });

  it('says "critical" (implying zero float) and never adds a float count', () => {
    const s = describeActivity(activity({ isCritical: true, totalFloat: 0 }));
    expect(s).toContain(', critical');
    expect(s).not.toContain('float');
  });

  it('states the float days for a near-critical activity', () => {
    expect(
      describeActivity(
        activity({
          isNearCritical: true,
          visualStart: null,
          visualEffectiveStart: null,
          visualEffectiveFinish: null,
          visualConflict: false,
          visualDriftDays: null,
          totalFloat: 2,
          freeFloat: null,
        }),
      ),
    ).toContain(', near-critical, 2 days float');
  });

  it('spells out a set date constraint (the spoken equivalent of the canvas pin)', () => {
    expect(
      describeActivity(activity({ constraintType: 'SNET', constraintDate: '2026-02-01' })),
    ).toContain(', Start no earlier than 01 Feb 2026');
    // A parked value is spoken honestly (how the engine applies it), matching the pin + table.
    expect(
      describeActivity(
        activity({ constraintType: 'MANDATORY_START', constraintDate: '2026-02-01' }),
      ),
    ).toContain(', Mandatory start — applied as Must start on 01 Feb 2026');
    // No clause when the pair is incomplete (no active constraint).
    expect(
      describeActivity(activity({ constraintType: 'SNET', constraintDate: null })),
    ).not.toContain('Start no earlier');
  });

  it('states plain float, singular for one day, and omits float when uncomputed', () => {
    expect(describeActivity(activity({ totalFloat: 1 }))).toContain(', 1 day float');
    expect(describeActivity(activity({ totalFloat: null }))).toBe(
      'Excavate, 3 working days, 01 Jan 2026 to 03 Jan 2026, lane 1',
    );
  });

  it('speaks a same-lane overlap only when the caller flags it (the spoken badge equivalent)', () => {
    expect(describeActivity(activity(), { overlapsInLane: true })).toContain(
      ', overlaps another activity in its lane',
    );
    expect(describeActivity(activity(), { overlapsInLane: false })).not.toContain('overlaps');
    expect(describeActivity(activity())).not.toContain('overlaps');
  });
});

describe('summarizeLogic (Tier 2)', () => {
  const deps = [
    edge({ predecessor: ep('p1', 'Survey'), successor: ep('x', 'Excavate'), isDriving: true }),
    edge({ predecessor: ep('p2', 'Permit'), successor: ep('x', 'Excavate') }),
    edge({ predecessor: ep('x', 'Excavate'), successor: ep('s1', 'Pour'), isDriving: true }),
    edge({ predecessor: ep('x', 'Excavate'), successor: ep('s2', 'Backfill') }),
  ];

  it('counts ties and names the driving predecessor + driven successors', () => {
    expect(summarizeLogic('x', deps)).toBe(
      '2 predecessors, 2 successors; start driven by Survey; drives Pour',
    );
  });

  it('pluralises correctly and omits driving clauses when there are none', () => {
    const one = [edge({ predecessor: ep('a', 'A'), successor: ep('x', 'X') })];
    expect(summarizeLogic('x', one)).toBe('1 predecessor, 0 successors');
  });
});

describe('chainNeighbour + announceChainStep', () => {
  const deps = [
    edge({ predecessor: ep('p1', 'Survey'), successor: ep('x', 'X') }),
    edge({ predecessor: ep('p2', 'Permit'), successor: ep('x', 'X'), isDriving: true }),
    edge({ predecessor: ep('x', 'X'), successor: ep('s1', 'Pour') }),
  ];

  it('prefers the driving predecessor over list order', () => {
    expect(chainNeighbour('x', deps, 'pred')).toEqual({ id: 'p2', name: 'Permit', driving: true });
  });

  it('falls back to the first tie when none drives', () => {
    expect(chainNeighbour('x', deps, 'succ')).toEqual({ id: 's1', name: 'Pour', driving: false });
  });

  it('returns null when there is no tie in that direction', () => {
    expect(chainNeighbour('s1', deps, 'succ')).toBeNull();
  });

  it('prefixes the neighbour code (cross-tier consistency with Tier 1)', () => {
    const coded = [
      edge({ predecessor: { id: 'p', code: 'A100', name: 'Survey' }, successor: ep('x', 'X') }),
    ];
    expect(chainNeighbour('x', coded, 'pred')).toEqual({
      id: 'p',
      name: 'A100 Survey',
      driving: false,
    });
    expect(announceChainStep('pred', chainNeighbour('x', coded, 'pred'))).toBe(
      'Predecessor: A100 Survey.',
    );
  });

  it('announces the neighbour, flagging a driving tie, and the empty case', () => {
    expect(announceChainStep('pred', chainNeighbour('x', deps, 'pred'))).toBe(
      'Predecessor: Permit, driving.',
    );
    expect(announceChainStep('succ', chainNeighbour('x', deps, 'succ'))).toBe('Successor: Pour.');
    expect(announceChainStep('succ', null)).toBe('No successors.');
  });
});
