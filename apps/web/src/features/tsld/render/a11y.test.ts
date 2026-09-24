import type { ActivitySummary, BaselineVarianceRow, DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  centreItemText,
  activityLabel,
  announceChainStep,
  baselineGhostClause,
  canvasLabel,
  chainNeighbour,
  compareClause,
  compareOverlaySummary,
  composeListboxRowText,
  describeActivity,
  lagPhrase,
  levelledGhostClause,
  levelledOverlaySummary,
  summarizeLogic,
  wbsGroupClause,
} from './a11y';
import { linkRung } from './link-marks';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    drivingResourceCalendarId: null,
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
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
    remainingDurationMinutes: null,
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
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    /**
     * **Matched to `earlyStart`/`earlyFinish` above, because that is what the engine writes for an
     * activity nobody has placed** — and the fixture said `null` opposite non-null early dates,
     * which is a row the product cannot produce.
     *
     * It was harmless while the Tier-1 sentence read the network's dates and became load-bearing at
     * the M-J gate pass, when that sentence moved to the DRAWN dates: every case here then resolved
     * a null start and returned "not yet scheduled", so eight assertions about float, lane,
     * constraints, drift and overlap went red at once against a correct function. That is the same
     * shape as `remainingFloat` below — an incomplete fixture turning into a wrong one the moment
     * the code under test starts reading the field it left out.
     */
    visualEffectiveStart: '2026-01-01',
    visualEffectiveFinish: '2026-01-03',
    visualConflict: false,
    visualConflictReason: null,
    visualDriftDays: null,
    // **Matched to `totalFloat` above, because the engine writes the pair together** (M-E-T7).
    // Left at `null` beside a `totalFloat` of 0, this fixture described a row the product cannot
    // produce — and once the Tier-1 sentence moved to the placed basis it silently stopped saying
    // anything about float at all, which is how a fixture that is merely incomplete turns into one
    // that is wrong.
    remainingFloat: 0,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('activityLabel (shared identity) and centreItemText', () => {
  it('leads with the name and follows it with the code when set (NetPoint grammar M4-T1, R7)', () => {
    expect(activityLabel(activity({ code: 'A1020', name: 'Erect steel' }), false)).toBe(
      'Erect steel, A1020',
    );
    expect(activityLabel(activity({ code: null, name: 'Erect steel' }), false)).toBe('Erect steel');
  });

  it('prints a code identical to the name once (#376: an imported P6 root WBS node)', () => {
    expect(
      activityLabel(
        activity({ code: 'EDF - Hynamics Proposal', name: 'EDF - Hynamics Proposal' }),
        true,
      ),
    ).toBe('EDF - Hynamics Proposal');
    // A code that merely STARTS the name is still a code, and is still printed.
    expect(activityLabel(activity({ code: 'A', name: 'A frame' }), false)).toBe('A frame, A');
  });

  it('the canvas prints the name alone, and the code only while codes are switched on', () => {
    const a = { code: 'A1020', name: 'Erect steel' };
    expect(canvasLabel(a, false)).toBe('Erect steel');
    expect(canvasLabel(a, true)).toBe('A1020 Erect steel');
    expect(canvasLabel({ code: null, name: 'Erect steel' }, true)).toBe('Erect steel');
    expect(canvasLabel({ code: 'Same', name: 'Same' }, true)).toBe('Same');
    // WCAG 2.5.3 needs the printed label inside the accessible name as one contiguous string, in
    // both states of the switch. The M4 version of this case checked each WORD of the coded label
    // was present in any order, which `Erect steel, A1020` passes and 2.5.3 does not (the M6
    // accessibility gate). Both limbs are asserted on the same `withCodes` the canvas uses.
    for (const withCodes of [false, true]) {
      expect(activityLabel(a, withCodes).startsWith(canvasLabel(a, withCodes))).toBe(true);
      expect(
        describeActivity(activity({ ...a, durationDays: 5 }), { withCodes }).startsWith(
          canvasLabel(a, withCodes),
        ),
      ).toBe(true);
    }
    expect(activityLabel(a, true)).toBe('A1020 Erect steel');
  });

  it('keeps the name row a leading substring of the accessible name (label-in-name)', () => {
    const a = activity({ code: 'A1020', name: 'Erect steel', durationDays: 5 });
    expect(describeActivity(a).startsWith(activityLabel(a, false))).toBe(true);
  });

  it('prints the duration and the float left in full, the duration alone short', () => {
    const task = { durationDays: 5, remainingFloat: 3, milestone: false, summary: false };
    expect(centreItemText(task, 'full')).toBe('5d · 3d float left');
    expect(centreItemText(task, 'short')).toBe('5d');
  });

  it('omits the float clause when the engine has not computed one, and states zero when it has', () => {
    expect(
      centreItemText(
        { durationDays: 5, remainingFloat: null, milestone: false, summary: false },
        'full',
      ),
    ).toBe('5d');
    expect(
      centreItemText(
        { durationDays: 5, remainingFloat: 0, milestone: false, summary: false },
        'full',
      ),
    ).toBe('5d · 0d float left');
  });

  it('draws nothing for a WBS summary, whose stored duration is not its rolled-up span (#375)', () => {
    // The importer writes 0 and recalculation never writes a summary's duration back, so this is
    // exactly the "0d · 0d float left" printed under an eleven-month summary bar.
    expect(
      centreItemText(
        { durationDays: 0, remainingFloat: 0, milestone: false, summary: true },
        'full',
      ),
    ).toBeNull();
    expect(
      centreItemText(
        { durationDays: 0, remainingFloat: 0, milestone: false, summary: true },
        'short',
      ),
    ).toBeNull();
  });

  it('draws nothing for a milestone, which has no bar to hold it', () => {
    expect(
      centreItemText(
        { durationDays: 0, remainingFloat: 4, milestone: true, summary: false },
        'full',
      ),
    ).toBeNull();
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
    lagMinutes: 0,
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
    // Both columns, because the sentence now tests the DRAWN start: before a recalculation the
    // engine has written neither, and clearing only `earlyStart` would leave this passing for a
    // reason that is not the one it is written for.
    expect(describeActivity(activity({ earlyStart: null, visualEffectiveStart: null }))).toBe(
      'Excavate, 3 working days, not yet scheduled',
    );
  });

  it('prefixes the code and gives duration + a date range + lane (1-based)', () => {
    expect(describeActivity(activity({ code: 'A100', laneIndex: 2 }))).toBe(
      'Excavate, A100, 3 working days, 01 Jan 2026 to 03 Jan 2026, lane 3, 0 days float left',
    );
  });

  it('speaks the working-day duration (singular for one day) and omits it for a zero-duration milestone', () => {
    expect(describeActivity(activity({ durationDays: 1 }))).toContain('Excavate, 1 working day,');
    expect(describeActivity(activity({ type: 'FINISH_MILESTONE', durationDays: 0 }))).not.toContain(
      'working day',
    );
  });

  it('collapses a single-day span to one date', () => {
    // `remainingFloat` beside `totalFloat`, because the engine writes the pair together and the
    // sentence now reads the placed basis (M-E-T7). A fixture setting only one of them describes a
    // row the product cannot produce.
    expect(
      describeActivity(
        activity({
          earlyFinish: '2026-01-01',
          visualEffectiveFinish: '2026-01-01',
          totalFloat: 5,
          remainingFloat: 5,
        }),
      ),
    ).toContain('1 Jan 2026, lane 1, 5 days float left');
  });

  it('says "critical" (implying zero float) and never adds a float count', () => {
    const s = describeActivity(activity({ isCritical: true, totalFloat: 0, remainingFloat: 0 }));
    expect(s).toContain(', critical');
    expect(s).not.toContain('float');
  });

  it('states the float days for a near-critical activity', () => {
    expect(
      describeActivity(
        activity({
          isNearCritical: true,
          visualStart: null,
          visualConflict: false,
          visualDriftDays: null,
          remainingFloat: 2,
          levelingPriority: null,
          leveledStart: null,
          leveledFinish: null,
          levelingDelayDays: null,
          levelingWindowExceeded: false,
          selfOverAllocated: false,
          percentCompleteType: 'DURATION',
          accrualType: 'UNIFORM',
          physicalPercentComplete: null,
          budgetedExpense: null,
          actualExpense: null,
          totalFloat: 2,
          freeFloat: null,
        }),
      ),
    ).toContain(', near-critical, 2 days float left');
  });

  it('names a positive drift in DAYS, never in "days float"', () => {
    /**
     * **A shipped defect with no coverage at all, found by reading rather than by failing.**
     *
     * The drift clause shared the float pluraliser, which appends the word *float* — so a bar
     * placed later than its earliest start announced `drift 2 days float later than its earliest
     * start`: a sentence naming the wrong quantity, which does not parse. It shipped that way and
     * M-E-T7 made it worse (`2 days float left later than …`) before anybody noticed, because
     * **nothing in the estate asserted this sentence**. It surfaced only because a journey failed
     * on a different line and sent me into the function.
     *
     * The same trap was avoided one function along — `summarizeLogic`'s slack phrase carries a
     * comment explaining precisely why it must not use the float helper. One correct pattern,
     * applied to a control and not to its neighbour.
     */
    const s = describeActivity(
      activity({ visualConflict: false, visualDriftDays: 2, remainingFloat: 3 }),
    );
    expect(s).toContain('drift 2 days later than its earliest start');
    expect(s).not.toContain('2 days float later');
    expect(s).not.toContain('2 days float left later');
    // The float clause is untouched and still labelled — the two read as different facts, which is
    // the distinction the drift clause's own comment says it exists to preserve.
    expect(s).toContain('3 days float left');
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
    expect(describeActivity(activity({ totalFloat: 1, remainingFloat: 1 }))).toContain(
      ', 1 day float left',
    );
    expect(describeActivity(activity({ totalFloat: null, remainingFloat: null }))).toBe(
      'Excavate, 3 working days, 01 Jan 2026 to 03 Jan 2026, lane 1',
    );
  });

  it('speaks the dates the BAR IS DRAWN AT, not the network\u2019s (the whole point of a placement)', () => {
    /**
     * **The one assertion the epic did not have, and the gap is why the defect shipped.**
     *
     * Every other fixture in this file carried `visualEffectiveStart === earlyStart`, so the two
     * bases were indistinguishable and reading the wrong one was invisible. Since M-F a bar draws
     * from `visualEffective*` (`barDateSourceFor` returns `'visual'` unless the Late overlay is on),
     * and this sentence is the ONLY route ADR-0026 D7 gives an AT user to a bar \u2014 so for any
     * activity carrying a placement the canvas showed one span and the listbox announced another
     * (WCAG 1.1.1/1.3.1).
     *
     * Verified red against the pre-fix `a.earlyStart`/`a.earlyFinish`, which announced the January
     * dates.
     */
    const placed = activity({
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-03',
      visualStart: '2026-02-10',
      visualEffectiveStart: '2026-02-10',
      visualEffectiveFinish: '2026-02-12',
      visualDriftDays: 28,
      remainingFloat: 0,
      totalFloat: 28,
    });
    expect(describeActivity(placed)).toContain('10 Feb 2026 to 12 Feb 2026');
    expect(describeActivity(placed)).not.toContain('Jan 2026');
  });

  it('follows the Late overlay when the caller says the bars are drawn at late dates', () => {
    // The source is the CALLER'S, never decided here \u2014 a second place deciding the basis is the
    // defect the case above removes. While the read-only Late overlay is on the bar draws at the
    // late dates, so this sentence does too, for free.
    expect(
      describeActivity(activity({ lateStart: '2026-03-01', lateFinish: '2026-03-03' }), {
        barDateSource: 'late',
      }),
    ).toContain('01 Mar 2026 to 03 Mar 2026');
  });

  it('names a placement past its constraint WITHOUT claiming it sits before its earliest start', () => {
    /**
     * **The `LATER_THAN_BOUND` sentence, which nothing asserted until the M-J gate pass** \u2014 the
     * one case M-D exists to detect was the one case the function described wrongly.
     *
     * Drift is `placed \u2212 earliest` (`engine/compute.ts:348`), so it is POSITIVE here, and the
     * clause gated on the `visualConflict` boolean, hard-coded the word "before" and ran the number
     * through `Math.abs()`. A bar placed five days PAST a "no later than" date was announced as
     * placed five days BEFORE its earliest start \u2014 in the same breath as a constraint clause
     * naming the date it had overrun.
     *
     * Verified red against the boolean-gated version, which produced
     * `conflict: placed 5 working days before its earliest feasible start`.
     */
    const s = describeActivity(
      activity({
        constraintType: 'FNLT',
        constraintDate: '2026-01-05',
        visualStart: '2026-01-06',
        visualEffectiveStart: '2026-01-06',
        visualEffectiveFinish: '2026-01-08',
        visualConflict: true,
        visualConflictReason: 'LATER_THAN_BOUND',
        visualDriftDays: 5,
        remainingFloat: 0,
        totalFloat: 5,
      }),
    );
    expect(s).toContain(', conflict: placed past the constraint on it');
    expect(s).not.toContain('before its earliest feasible start');
    // And the positive-drift clause stays out of its way: that sentence is for a placement that is
    // merely late, not one that has breached a bound, and two of them would contradict each other.
    expect(s).not.toContain('drift');
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
      '2 predecessors, 2 successors; start driven by Survey (FS); drives Pour (FS)',
    );
  });

  it('pluralises correctly and omits driving clauses when there are none', () => {
    const one = [edge({ predecessor: ep('a', 'A'), successor: ep('x', 'X') })];
    expect(summarizeLogic('x', one)).toBe('1 predecessor, 0 successors');
  });

  it('speaks the lag on a lagged driving tie, and the type alone on a zero-lag one', () => {
    const lagged = [
      edge({
        predecessor: ep('p1', 'Survey'),
        successor: ep('x', 'Excavate'),
        type: 'SS',
        lagDays: 3,
        lagMinutes: 1440,
        isDriving: true,
      }),
      edge({
        predecessor: ep('x', 'Excavate'),
        successor: ep('s1', 'Pour'),
        type: 'FS',
        lagDays: -1,
        lagMinutes: -480,
        isDriving: true,
      }),
    ];
    expect(summarizeLogic('x', lagged)).toBe(
      '1 predecessor, 1 successor; start driven by Survey (SS + 3 working days); drives Pour (FS - 1 working day)',
    );
    // NetPoint grammar M3-T4 (#374 item 6): a zero-lag tie names its type too. What a gap label
    // measures depends on the type (FS finish to start, SS start to start), so a sentence without
    // it cannot say what the drawn link says.
    expect(summarizeLogic('x', deps)).toBe(
      '2 predecessors, 2 successors; start driven by Survey (FS); drives Pour (FS)',
    );
  });

  it('speaks per-tie slack for the non-binding ties (the spoken twin of the canvas chip)', () => {
    // The map is what the canvas draws its `Nd` chips from; the driving ties carry 0 and are
    // already reported as the driver, so only the two waiting ties get a clause (ADR-0054 §5).
    const w = (days: number) => ({ days, unit: 'working' as const });
    const slack = new Map([
      ['p1->x', w(0)],
      ['p2->x', w(4)],
      ['x->s1', w(0)],
      ['x->s2', w(2)],
    ]);
    // NetPoint grammar M3-T2: in the unit the gap label prints, working days on the plan calendar.
    expect(summarizeLogic('x', deps, slack)).toBe(
      '2 predecessors, 2 successors; start driven by Survey (FS); drives Pour (FS); slack to Permit (FS) 4 working days, Backfill (FS) 2 working days',
    );
  });

  it('says calendar days where no calendar is loaded, as the `cal d` label does', () => {
    const slack = new Map([['p2->x', { days: 1, unit: 'calendar' as const }]]);
    expect(summarizeLogic('x', deps, slack)).toContain('slack to Permit (FS) 1 calendar day');
  });

  it('leaves the sentence untouched when no slack is supplied or none is positive', () => {
    const before = '2 predecessors, 2 successors; start driven by Survey (FS); drives Pour (FS)';
    expect(summarizeLogic('x', deps, new Map())).toBe(before);
    expect(
      summarizeLogic('x', deps, new Map([['p2->x', { days: 0, unit: 'working' as const }]])),
    ).toBe(before);
  });
});

/**
 * **The link's rung and the words for criticality read one pair of flags** (NetPoint grammar M3-T4,
 * `docs/TECH_DEBT.md` #374 item 7).
 *
 * A driving link between two activities is drawn in the rung `linkRung` returns, and each
 * activity's sentence says `critical` / `near-critical` from `describeActivity`. They agree today
 * because both read `isCritical` and `isNearCritical`. This pins the agreement over every
 * combination of the two flags (including both set, which the engine does not produce and which
 * both must resolve the same way), so a later change to either rule that makes them disagree fails
 * here. A behavioural table rather than the source scan the plan named: a scan can say both read
 * the same field names and still pass when one of them starts reading them in a different order.
 */
describe('linkRung and describeActivity agree on criticality (#374 item 7)', () => {
  const words = (s: string): 'critical' | 'near' | 'normal' =>
    s.includes(', critical') ? 'critical' : s.includes(', near-critical') ? 'near' : 'normal';
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('isCritical %s, isNearCritical %s', (isCritical, isNearCritical) => {
    const a = activity({ isCritical, isNearCritical, remainingFloat: 3 });
    expect(linkRung(a, a)).toBe(words(describeActivity(a)));
  });
});

describe('lagPhrase (the spoken time-true anchor offset, ADR-0052)', () => {
  it('says just the type for a zero-lag tie', () => {
    expect(lagPhrase({ type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' })).toBe('FS');
  });

  it('speaks a working-day lag, singular for one day', () => {
    expect(lagPhrase({ type: 'SS', lagDays: 3, lagCalendar: 'PROJECT_DEFAULT' })).toBe(
      'SS + 3 working days',
    );
    expect(lagPhrase({ type: 'FF', lagDays: 1, lagCalendar: 'SUCCESSOR' })).toBe(
      'FF + 1 working day',
    );
  });

  it('speaks a lead as a minus', () => {
    expect(lagPhrase({ type: 'FS', lagDays: -2, lagCalendar: 'PROJECT_DEFAULT' })).toBe(
      'FS - 2 working days',
    );
  });

  it('names a TWENTY_FOUR_HOUR lag as elapsed, matching the elapsed anchor walk', () => {
    expect(lagPhrase({ type: 'SF', lagDays: 7, lagCalendar: 'TWENTY_FOUR_HOUR' })).toBe(
      'SF + 7 elapsed days',
    );
  });
});

describe('chainNeighbour + announceChainStep', () => {
  const deps = [
    edge({ predecessor: ep('p1', 'Survey'), successor: ep('x', 'X') }),
    edge({ predecessor: ep('p2', 'Permit'), successor: ep('x', 'X'), isDriving: true }),
    edge({ predecessor: ep('x', 'X'), successor: ep('s1', 'Pour') }),
  ];

  it('prefers the driving predecessor over list order', () => {
    expect(chainNeighbour('x', deps, 'pred', false)).toEqual({
      id: 'p2',
      name: 'Permit',
      driving: true,
    });
  });

  it('falls back to the first tie when none drives', () => {
    expect(chainNeighbour('x', deps, 'succ', false)).toEqual({
      id: 's1',
      name: 'Pour',
      driving: false,
    });
  });

  it('returns null when there is no tie in that direction', () => {
    expect(chainNeighbour('s1', deps, 'succ', false)).toBeNull();
  });

  it('names the neighbour as Tier 1 does, name then code (cross-tier consistency)', () => {
    const coded = [
      edge({ predecessor: { id: 'p', code: 'A100', name: 'Survey' }, successor: ep('x', 'X') }),
    ];
    expect(chainNeighbour('x', coded, 'pred', false)).toEqual({
      id: 'p',
      name: 'Survey, A100',
      driving: false,
    });
    expect(announceChainStep('pred', chainNeighbour('x', coded, 'pred', false))).toBe(
      'Predecessor: Survey, A100.',
    );
    // With codes printed, the neighbour is named as the canvas prints it (WCAG 2.5.3).
    expect(chainNeighbour('x', coded, 'pred', true)?.name).toBe('A100 Survey');
  });

  it('announces the neighbour, flagging a driving tie, and the empty case', () => {
    expect(announceChainStep('pred', chainNeighbour('x', deps, 'pred', false))).toBe(
      'Predecessor: Permit, driving.',
    );
    expect(announceChainStep('succ', chainNeighbour('x', deps, 'succ', false))).toBe(
      'Successor: Pour.',
    );
    expect(announceChainStep('succ', null)).toBe('No successors.');
  });
});

// ── ADR-0052 M4 a11y-string parity ───────────────────────────────────────────────────────
// The bar visual refresh RESTYLES the canvas (shape/stroke/progress/glyphs/badges) but must not
// change one character of the parallel accessible representation: these pin the exact strings for
// the badge-carrying cases the refresh touches visually (constraint pin, conflict triangle,
// lane-overlap squares) and the lag phrase, so any drift fails loudly.
//
// **Re-baselined once, deliberately, at one-planning-surface M-E-T7**, when the float clause moved
// from `totalFloat` to `remainingFloat` and gained the word `left`. The pin did its job: it was
// one of two assertions that caught the sentence changing, which is exactly what a byte-for-byte
// pin is for — the change is intended and is recorded here rather than absorbed by loosening the
// assertion, which is how such a pin quietly stops pinning anything.
describe('a11y-string parity across the M4 visual refresh', () => {
  it('pins the full badge-carrying Tier-1 sentence byte-for-byte', () => {
    expect(
      describeActivity(
        activity({
          code: 'A100',
          constraintType: 'SNET',
          constraintDate: '2026-01-02',
          visualConflict: true,
          visualDriftDays: -2,
          // **2, not null** — `remainingFloat` is `totalFloat - visualDriftDays`, so a bar placed
          // two working days before its earliest feasible start has two days of room before its
          // late finish even while the placement itself is infeasible. The two facts are stated
          // separately and always were: the float clause is about the finish, the conflict clause
          // about the start. The fixture's previous `null` beside a drift of −2 was a row the
          // engine cannot write.
          remainingFloat: 2,
        }),
        { overlapsInLane: true },
      ),
    ).toBe(
      'Excavate, A100, 3 working days, 01 Jan 2026 to 03 Jan 2026, lane 1, 2 days float left, ' +
        'Start no earlier than 02 Jan 2026, ' +
        'conflict: placed 2 working days before its earliest feasible start, ' +
        'overlaps another activity in its lane',
    );
  });

  it('pins the lag phrases byte-for-byte (the spoken twin of the drawn anchor offset)', () => {
    expect(lagPhrase({ type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' })).toBe('FS');
    expect(lagPhrase({ type: 'SS', lagDays: 3, lagCalendar: 'PROJECT_DEFAULT' })).toBe(
      'SS + 3 working days',
    );
    expect(lagPhrase({ type: 'FS', lagDays: -1, lagCalendar: 'TWENTY_FOUR_HOUR' })).toBe(
      'FS - 1 elapsed day',
    );
  });

  it('pins the accessible identity byte-for-byte (name, then code; the canvas name leads it)', () => {
    expect(activityLabel({ code: 'A100', name: 'Excavate' }, false)).toBe('Excavate, A100');
    expect(activityLabel({ code: 'A100', name: 'Excavate' }, true)).toBe('A100 Excavate');
  });
});

// ── Lens marks: the row's text equivalents for what the canvas is currently drawing ──────────

function variance(over: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow {
  return {
    activityId: 'a1',
    code: null,
    name: 'Excavate',
    inBaseline: true,
    removed: false,
    currentStart: '2026-01-06',
    currentFinish: '2026-01-10',
    currentTotalFloat: 0,
    baselineStart: '2026-01-01',
    baselineFinish: '2026-01-05',
    baselineTotalFloat: 0,
    startVarianceDays: 5,
    finishVarianceDays: 5,
    floatVarianceDays: 0,
    ...over,
  };
}

describe('wbsGroupClause (the WBS colour lens’s text equivalent)', () => {
  const labels = new Map([['sum', 'A200']]);

  it('names the group an activity is filed under', () => {
    expect(wbsGroupClause({ parentId: 'sum', type: 'TASK' }, labels)).toBe(' (group: A200)');
  });

  it('says ungrouped for a top-level activity', () => {
    expect(wbsGroupClause({ parentId: null, type: 'TASK' }, labels)).toBe(' (ungrouped)');
  });

  it('says ungrouped for an orphan — a parentId naming a row the plan does not hold', () => {
    // The rule `features/wbs/model/wbs-groups.ts` and the Gantt row model already agree on, reached
    // here by a lookup miss rather than by a second "who is my parent" resolution.
    expect(wbsGroupClause({ parentId: 'gone', type: 'TASK' }, labels)).toBe(' (ungrouped)');
  });

  it('says nothing for a top-level summary — a summary IS a group', () => {
    expect(wbsGroupClause({ parentId: null, type: 'WBS_SUMMARY' }, labels)).toBe('');
  });
});

describe('baselineGhostClause (the baseline ghost’s text equivalent)', () => {
  it('names the captured span and the finish variance, in the variance table’s direction words', () => {
    expect(baselineGhostClause(variance())).toBe(
      ' (baseline 01 Jan 2026 to 05 Jan 2026, finish 5 working days behind)',
    );
    expect(baselineGhostClause(variance({ finishVarianceDays: -1 }))).toBe(
      ' (baseline 01 Jan 2026 to 05 Jan 2026, finish 1 working day ahead)',
    );
    expect(baselineGhostClause(variance({ finishVarianceDays: 0 }))).toBe(
      ' (baseline 01 Jan 2026 to 05 Jan 2026, finish on baseline)',
    );
  });

  it('states one date for a baselined milestone (start === finish)', () => {
    expect(
      baselineGhostClause(variance({ baselineStart: '2026-01-01', baselineFinish: '2026-01-01' })),
    ).toContain('(baseline 01 Jan 2026,');
  });

  it('says the span alone when the variance is not comparable', () => {
    expect(baselineGhostClause(variance({ finishVarianceDays: null }))).toBe(
      ' (baseline 01 Jan 2026 to 05 Jan 2026)',
    );
  });

  it('says nothing where there is no ghost — removed, or null baseline dates', () => {
    expect(baselineGhostClause(variance({ removed: true }))).toBe('');
    expect(baselineGhostClause(variance({ baselineStart: null }))).toBe('');
    expect(baselineGhostClause(variance({ baselineFinish: null }))).toBe('');
  });

  it('qualifies the comparison when the Late overlay is drawing the live bars', () => {
    expect(baselineGhostClause(variance(), { lateView: true })).toBe(
      ' (baseline 01 Jan 2026 to 05 Jan 2026 vs the late view, finish 5 working days behind)',
    );
  });
});

describe('composeListboxRowText', () => {
  it('is the Tier-1 sentence unchanged when no lens is marking the row', () => {
    expect(composeListboxRowText({ description: 'Excavate, 3 working days' })).toBe(
      'Excavate, 3 working days',
    );
  });

  it('appends the marks in reading order: dim reasons, over-allocation, baseline, group', () => {
    expect(
      composeListboxRowText({
        description: 'Excavate',
        dimReasons: ['filtered out', 'off the logic path'],
        overAllocated: true,
        baseline: ' (baseline 01 Jan 2026 to 05 Jan 2026)',
        wbsGroup: ' (group: A200)',
      }),
    ).toBe(
      'Excavate (filtered out, off the logic path) (over-allocated) ' +
        '(baseline 01 Jan 2026 to 05 Jan 2026) (group: A200)',
    );
  });
});

describe('the comparison overlay’s spoken summary', () => {
  let nextId = 0;
  const ghost = (name: string, removed = false) => ({
    // A distinct id per ghost, because the product's names are NOT unique — only `code` carries a
    // per-plan unique index. See the duplicate-key case below.
    activityId: `a${String((nextId += 1))}`,
    name,
    removed,
  });

  it('is absent when the overlay draws nothing', () => {
    // A description of a picture nobody is looking at is noise, not an equivalent.
    expect(compareOverlaySummary([], 0)).toBeNull();
  });

  it('lists the REMOVED activities and only those', () => {
    // An activity that merely moved already has a listbox row; a removed one has none, which is
    // the whole reason this list exists (ADR-0122).
    const summary = compareOverlaySummary([ghost('Piling'), ghost('Site hoarding', true)], 0);
    expect(summary?.removed.map((r) => r.name)).toEqual(['Site hoarding']);
    expect(summary?.heading).toContain('1 moved');
    expect(summary?.heading).toContain('1 removed');
  });

  it('carries an id per removed activity, so two of one name are two rows', () => {
    /**
     * `docs/TECH_DEBT.md` #255 item 6. The removed list was `string[]` of names and the consumer
     * rendered `key={name}`, so two removed activities sharing a name produced a duplicate React
     * key — React then treats them as one row and drops the second from the list a screen-reader
     * user is given, which is the one channel with no way to check.
     *
     * **Reachable, not theoretical**: nothing in this product makes an activity name unique. Only
     * `code` carries a per-plan unique index (`uq_activities_plan_code`), and two removed
     * "Excavate" rows are exactly what a re-sequenced programme produces.
     */
    const summary = compareOverlaySummary([ghost('Excavate', true), ghost('Excavate', true)], 0);
    expect(summary?.removed).toHaveLength(2);
    const keys = summary?.removed.map((r) => r.activityId) ?? [];
    expect(new Set(keys).size).toBe(2);
    // The NAME is still what a reader hears — the id is a key and never copy.
    expect(summary?.removed.map((r) => r.name)).toEqual(['Excavate', 'Excavate']);
  });

  it('states what it could NOT draw, and why, rather than going quiet', () => {
    // A diagram has no "showing N of M", so a picture missing rows is unnoticeable.
    const summary = compareOverlaySummary([ghost('Piling')], 3);
    expect(summary?.heading).toContain('3 not shown');
    expect(summary?.heading).toContain('did not record where they were');
  });

  it('counts changed links and points at the change list, never listing them', () => {
    // A link is not a selectable object here and there is no listbox of edges (spec §4.8), so the
    // honest answer is a count plus the route — not an invented list, and not silence.
    const summary = compareOverlaySummary([], 0, { drawn: 2, undrawable: 1 });
    expect(summary?.heading).toContain('2 changed links');
    expect(summary?.heading).toContain('1 changed link not shown');
    expect(summary?.heading).toContain('listed in words under Changes');
  });

  it('says nothing about logic when no link changed', () => {
    const summary = compareOverlaySummary([ghost('Piling')], 0);
    expect(summary?.heading).not.toContain('under Changes');
  });

  describe('the undrawable reason — two comparisons, two TRUE answers', () => {
    /**
     * **The likeliest defect in the cross-plan milestone, and it is a false sentence rather than a
     * missing one.**
     *
     * Same-plan the old side genuinely did not record a position. Cross-plan the other plan DID
     * record it — the position simply is not comparable, because two independently imported plans
     * derive their lane order separately. Shipping the same-plan wording would state something
     * untrue about the other plan's data, which is worse than saying nothing, and it is likely
     * precisely because the mechanism is correct and reusing it feels like reuse.
     */
    it('the same-plan sentence is UNCHANGED — asserted, not assumed', () => {
      // The default, and the exact wording that shipped. If a cross-plan edit reaches this branch
      // it is a regression on the comparison nobody was working on.
      const summary = compareOverlaySummary([ghost('Piling')], 3);
      expect(summary?.heading).toContain(
        '3 not shown because the old revision did not record where they were',
      );
      expect(summary?.heading).not.toContain('independently');
    });

    it('the cross-plan sentence says the positions are not COMPARABLE, never unrecorded', () => {
      const summary = compareOverlaySummary([ghost('Piling')], 3, undefined, 'NOT_COMPARABLE');
      expect(summary?.heading).toContain('3 not shown');
      expect(summary?.heading).toContain('lay their activities out independently');
      // The false half, asserted absent rather than left to a reader to notice.
      expect(summary?.heading).not.toContain('did not record');
      // And it points at where the work IS carried, so the fact survives the position not doing so.
      expect(summary?.heading).toContain('Changes');
    });

    it('the reason changes nothing else — the removed list and the counts are identical', () => {
      // A discriminator that quietly altered a neighbouring sentence would be the widening this
      // repository keeps recording; the two summaries differ in exactly one clause.
      const rows = [ghost('Piling'), ghost('Site hoarding', true)];
      const samePlan = compareOverlaySummary(rows, 2);
      const crossPlan = compareOverlaySummary(rows, 2, undefined, 'NOT_COMPARABLE');
      expect(crossPlan?.removed).toEqual(samePlan?.removed);
      expect(crossPlan?.undrawn).toBe(samePlan?.undrawn);
      expect(crossPlan?.heading).toContain('1 moved');
      expect(crossPlan?.heading).toContain('1 removed');
    });
  });
});

describe('the per-row compare clause', () => {
  it('says where the bar WAS, which the canvas can only draw', () => {
    // ADR-0127 D6 asserted a changed activity "already has a route: it is an option in the
    // parallel listbox". True about the row and silent about the comparison — a different claim,
    // and the epic's own plan called this clause "real work, and it is not optional".
    expect(compareClause({ fromStart: '2026-01-05', fromFinish: '2026-01-09' })).toContain(
      'earlier revision',
    );
    expect(compareClause({ fromStart: '2026-01-05', fromFinish: '2026-01-09' })).toContain('to');
  });

  it('states a single-day span once rather than as a range to itself', () => {
    const clause = compareClause({ fromStart: '2026-01-05', fromFinish: '2026-01-05' });
    expect(clause).not.toContain(' to ');
  });
});

describe('the levelled ghost clause', () => {
  it('says nothing when the lens drew this row no ghost', () => {
    // Absence is not narrated, and the test is the same one the painter applies — both walk the
    // gated array, so a row with a clause always has a ghost and one without never does.
    expect(levelledGhostClause(null)).toBe('');
  });

  it('states the ghost as a DATE, not an offset', () => {
    /**
     * The tempting field is `levelingDelayDays` — engine-owned, already in working days, on the
     * same row — and it is measured from the EARLY start while the bar is drawn at the PLACED one.
     * It would be right on every plan in the estate today and wrong on exactly the plans this epic
     * exists to create.
     */
    const clause = levelledGhostClause('2026-03-12');
    expect(clause).toContain('levelled to');
    expect(clause).toMatch(/12 Mar 2026/);
    expect(clause).not.toMatch(/\d+ working days? (later|earlier)/);
  });

  it('is one parenthesised clause, like its two ghost siblings', () => {
    // The row is read on every arrow keystroke, and three ghost clauses already share its budget.
    expect(levelledGhostClause('2026-03-12')).toMatch(/^ \([^()]*\)$/);
  });

  /**
   * **What is NOT here, and why, because the absence is the milestone's main finding.**
   *
   * This clause began as one describing both M-E overlays — the feasible window and this ghost —
   * with cases for float, zero float, negative float, drift in both directions and the joint form.
   * Every one of them passed. The journey's first run printed the finished row and the window's
   * half was redundant to the last word: `describeActivity` already states the remaining float
   * (M-E-T7), already names a positive drift, and already names the negative-drift conflict. The
   * bracket DRAWS two facts the sentence carries; it does not add a third.
   *
   * Two unit suites could not see it, because each was right about its own function. Deleting
   * those cases is the correct outcome, and it is recorded here rather than left as a gap somebody
   * later "fixes" by writing them again.
   */
});

describe('the levelled overlay summary — the empty state is the common one', () => {
  it('counts what it drew', () => {
    expect(levelledOverlaySummary(3, { levelResources: true })?.heading).toContain('3 activities');
    expect(levelledOverlaySummary(1, { levelResources: true })?.heading).toContain('1 activity');
  });

  it('withholds the visible strip when the lens DID draw', () => {
    // A complete picture carries no chrome: the strip exists to report an absence.
    expect(levelledOverlaySummary(2, { levelResources: true })?.undrawnLabel).toBe('');
  });

  it('separates "levelling is off" from "levelling moved nothing"', () => {
    /**
     * The whole of T6. These are different facts — one names a setting a planner can change, the
     * other reports a result — and the control's shaded reason covers only the first, because the
     * second is not a refusal (M-E-T3). So this sentence is the only place it is ever said, and a
     * single sentence for both cases would make a switched-off feature indistinguishable from a
     * satisfied one (ADR-0073 C1's finding, applied to a diagram).
     */
    const off = levelledOverlaySummary(0, { levelResources: false });
    const ran = levelledOverlaySummary(0, { levelResources: true });
    expect(off?.undrawnLabel).not.toBe(ran?.undrawnLabel);
    expect(off?.undrawnLabel).toMatch(/off for this plan/);
    expect(ran?.undrawnLabel).toMatch(/did not move/);
  });

  it('always has something visible to say when it drew nothing', () => {
    // FC-1 predicts this is the state on nearly every plan on the day it ships. A lens that lights
    // and draws nothing with no sentence is the lit-but-inert dead end, not an edge case.
    for (const levelResources of [true, false]) {
      expect(levelledOverlaySummary(0, { levelResources })?.undrawnLabel).not.toBe('');
    }
  });
});
