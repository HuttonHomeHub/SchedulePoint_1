import { fixtureSpec, type SeedSpec } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import {
  buildRuleInput,
  CALENDAR_SHAPES,
  ruleInputOfSpec,
  type OracleActivity,
  type OracleLink,
  type OraclePlan,
  type RuleInput,
} from '../../../../test/support/redundant-links-oracle';

import {
  DEFAULT_RELAXATION_LIMIT,
  findRedundantLinks,
  type RedundantLinksResult,
} from './redundant-links';

/**
 * The rule's own cases: one per row of the spec's §2.3 table (R1 to R17, N3), then totality and
 * determinism. Soundness against the engine is a different suite (`redundant-links.soundness.spec.ts`);
 * these pin **which** links the rule flags, so a change that makes it flag more or fewer is a decision
 * and not an accident.
 */
const DAY = 1440;

function flag(
  activities: OracleActivity[],
  links: OracleLink[],
  extra: Partial<OraclePlan> = {},
  budget = DEFAULT_RELAXATION_LIMIT,
): RedundantLinksResult {
  const plan: OraclePlan = {
    dataDate: '2026-01-05',
    calendars: CALENDAR_SHAPES,
    planCalendar: 'MON_FRI',
    activities,
    links,
    ...extra,
  };
  return run(buildRuleInput(plan), budget);
}

function run(input: RuleInput, budget = DEFAULT_RELAXATION_LIMIT): RedundantLinksResult {
  return findRedundantLinks(input.activities, input.dependencies, { relaxationLimit: budget });
}

const task = (id: string, extra: Partial<OracleActivity> = {}): OracleActivity => ({
  id,
  durationMinutes: DAY,
  ...extra,
});
const link = (
  id: string,
  from: string,
  to: string,
  type: OracleLink['type'] = 'FS',
  lagMinutes = 0,
  extra: Partial<OracleLink> = {},
): OracleLink => ({ id, from, to, type, lagMinutes, ...extra });

const ids = (r: RedundantLinksResult): string[] => r.offenders.map((o) => o.linkId);

/** A, B, C with A→B, B→C and a direct A→C; the cases below vary one thing each. */
const abc = (
  d: Partial<OracleLink> & { type?: OracleLink['type'] },
  chain: {
    ab?: Partial<OracleLink>;
    bc?: Partial<OracleLink>;
    a?: Partial<OracleActivity>;
    b?: Partial<OracleActivity>;
    c?: Partial<OracleActivity>;
  } = {},
  extra: Partial<OraclePlan> = {},
): RedundantLinksResult =>
  flag(
    [task('A', chain.a), task('B', chain.b), task('C', chain.c)],
    [
      link('AB', 'A', 'B', 'FS', 0, chain.ab),
      link('BC', 'B', 'C', 'FS', 0, chain.bc),
      link('AC', 'A', 'C', d.type ?? 'FS', d.lagMinutes ?? 0, d),
    ],
    extra,
  );

describe('the rule on the spec §2.3 table', () => {
  it('R1: A to C FS 0 beside A to B to C is redundant, and says through B', () => {
    const r = abc({});
    expect(ids(r)).toEqual(['AC']);
    expect(r.offenders[0]).toEqual({ linkId: 'AC', via: ['B'], parallelType: null });
    expect(r.unjudged).toBe(0);
    expect(r.searchCapped).toBe(false);
  });

  it('R2: FS +5 days beside a zero-lag chain is not flagged', () => {
    expect(ids(abc({ lagMinutes: 5 * DAY }))).toEqual([]);
  });

  it('R3: FS +2 beside +1 and +1 on the same key is redundant', () => {
    expect(
      ids(abc({ lagMinutes: 2 * DAY }, { ab: { lagMinutes: DAY }, bc: { lagMinutes: DAY } })),
    ).toEqual(['AC']);
  });

  it('R4: positive lags on two keys are not flagged', () => {
    expect(
      ids(
        abc(
          { lagMinutes: 2 * DAY },
          { ab: { lagMinutes: DAY, lagCalendar: 'TWENTY_FOUR_HOUR' }, bc: { lagMinutes: DAY } },
        ),
      ),
    ).toEqual([]);
  });

  it('R5: an SS link beside a finish-to-start chain is redundant', () => {
    expect(ids(abc({ type: 'SS' }))).toEqual(['AC']);
  });

  it('R6: an FF link beside a finish-to-start chain is redundant', () => {
    expect(ids(abc({ type: 'FF' }))).toEqual(['AC']);
  });

  it('R7: FS beside a chain that leaves A at its start is not flagged', () => {
    const r = flag(
      [task('A'), task('B'), task('C')],
      [link('AB', 'A', 'B', 'SS'), link('BC', 'B', 'C', 'SS'), link('AC', 'A', 'C', 'FS')],
    );
    expect(ids(r)).toEqual([]);
  });

  it('R8: FS beside a chain that binds C at its finish is not flagged', () => {
    const r = flag(
      [task('A'), task('B'), task('C')],
      [link('AB', 'A', 'B'), link('BC', 'B', 'C', 'FF'), link('AC', 'A', 'C')],
    );
    expect(ids(r)).toEqual([]);
  });

  it('R9: an FF entry into B is redundant on one calendar and not across calendars', () => {
    const chain = (calendars: [string | null, string | null, string | null]) =>
      flag(
        [
          task('A', { calendar: calendars[0] }),
          task('B', { calendar: calendars[1] }),
          task('C', { calendar: calendars[2] }),
        ],
        [link('AB', 'A', 'B', 'FF'), link('BC', 'B', 'C'), link('AC', 'A', 'C')],
      );
    expect(ids(chain([null, null, null]))).toEqual(['AC']);
    expect(ids(chain(['MON_SAT', 'MON_SAT', 'MON_SAT']))).toEqual(['AC']);
    expect(ids(chain(['MON_SAT', 'MON_FRI', 'MON_SAT']))).toEqual([]);
  });

  // W5, amended 2026-10-17: single-calendar mode no longer needs the chain's non-zero lags on the shared
  // calendar when D's lag is not positive. These two pin both halves: relaxed, and still required.
  const sameCalendarChain = (
    dLag: number,
    chainKey: NonNullable<OracleLink['lagCalendar']>,
    dKey: NonNullable<OracleLink['lagCalendar']> = 'PROJECT_DEFAULT',
  ) =>
    flag(
      [
        task('A', { calendar: 'MON_SAT' }),
        task('B', { calendar: 'MON_SAT' }),
        task('C', { calendar: 'MON_SAT' }),
      ],
      [
        // Enters B at its finish and B is left at its finish: only single-calendar mode may pass it.
        link('AB', 'A', 'B', 'FF', DAY, { lagCalendar: chainKey }),
        link('BC', 'B', 'C'),
        link('AC', 'A', 'C', 'FS', dLag, { lagCalendar: dKey }),
      ],
    );

  it('W5 relaxed: a chain lag on another calendar is fine when D has no positive lag', () => {
    // The chain's SS lag is elapsed (24 hours), not on MON_SAT; D is a zero-lag FS.
    expect(ids(sameCalendarChain(0, 'TWENTY_FOUR_HOUR'))).toEqual(['AC']);
    expect(ids(sameCalendarChain(-DAY, 'TWENTY_FOUR_HOUR'))).toEqual(['AC']);
  });

  it('W5 kept for a positive D lag: the same calendar is still required', () => {
    // D = +1 day on its successor's calendar (the shared MON_SAT), the chain's lag on elapsed time:
    // two keys, not flagged. The same D with the chain's lag on MON_SAT too is flagged.
    expect(ids(sameCalendarChain(DAY, 'TWENTY_FOUR_HOUR', 'SUCCESSOR'))).toEqual([]);
    expect(ids(sameCalendarChain(DAY, 'SUCCESSOR', 'SUCCESSOR'))).toEqual(['AC']);
  });

  it('R10: a mandatory-start intermediate is not flagged', () => {
    expect(
      ids(abc({}, { b: { constraintType: 'MANDATORY_START', constraintDate: '2026-01-05' } })),
    ).toEqual([]);
  });

  it('R11: a chain through a level of effort is not flagged, and the LOE link is not checked', () => {
    const r = flag(
      [task('A'), task('L', { type: 'LEVEL_OF_EFFORT', durationMinutes: 0 }), task('C')],
      [link('AL', 'A', 'L'), link('LC', 'L', 'C'), link('AC', 'A', 'C')],
    );
    expect(ids(r)).toEqual([]);
    // Both links that touch the level of effort are counted: AL ends at it and LC leaves it.
    expect(r.unjudged).toBe(2);
  });

  it('R12: a lead on the chain is not flagged', () => {
    expect(ids(abc({}, { ab: { lagMinutes: -DAY } }))).toEqual([]);
  });

  it('R13: a lead on D is redundant beside a zero-lag chain', () => {
    expect(ids(abc({ lagMinutes: -DAY }))).toEqual(['AC']);
  });

  it('R14: an SS link beside an FS link between the same two activities is redundant', () => {
    const r = flag(
      [task('A'), task('B')],
      [link('SS', 'A', 'B', 'SS'), link('FS', 'A', 'B', 'FS')],
    );
    expect(ids(r)).toEqual(['SS']);
    expect(r.offenders[0]).toEqual({ linkId: 'SS', via: [], parallelType: 'FS' });
  });

  it('R15: an SS+2 and FF+2 ladder flags neither', () => {
    const r = flag(
      [task('A'), task('B')],
      [link('SS', 'A', 'B', 'SS', 2 * DAY), link('FF', 'A', 'B', 'FF', 2 * DAY)],
    );
    expect(ids(r)).toEqual([]);
  });

  it('R16: a started intermediate is not flagged', () => {
    expect(ids(abc({}, { b: { actualStart: '2026-01-02', remainingMinutes: 60 } }))).toEqual([]);
  });

  it('R17: a pinned successor is not checked, and is counted', () => {
    const r = abc({}, { c: { constraintType: 'MSO', constraintDate: '2026-01-12' } });
    expect(ids(r)).toEqual([]);
    expect(r.unjudged).toBe(2); // AC and BC both end at the pinned C
  });

  it('N3: two parallel paths are not an implied link', () => {
    const r = flag(
      [task('N1'), task('N2'), task('N3'), task('N4')],
      [
        link('12', 'N1', 'N2'),
        link('24', 'N2', 'N4'),
        link('13', 'N1', 'N3'),
        link('34', 'N3', 'N4'),
      ],
    );
    expect(ids(r)).toEqual([]);
    expect(r.unjudged).toBe(0);
  });

  it('a started predecessor is allowed: A may be anything but a level of effort or a summary', () => {
    expect(ids(abc({}, { a: { actualStart: '2026-01-02', remainingMinutes: 60 } }))).toEqual([
      'AC',
    ]);
  });

  it('a three-parallel-link case: the third link is implied by either of the other two', () => {
    const r = flag(
      [task('A'), task('B')],
      [link('FS', 'A', 'B', 'FS'), link('SS', 'A', 'B', 'SS'), link('FF', 'A', 'B', 'FF')],
    );
    // FS implies both SS (π F ≥ S, σ S ≤ S) and FF (π F ≥ F, σ S ≤ F); neither implies FS.
    expect(ids(r).sort()).toEqual(['FF', 'SS']);
  });

  it('a chain longer than two links names every intermediate', () => {
    const r = flag(
      [task('A'), task('B'), task('C'), task('D')],
      [link('AB', 'A', 'B'), link('BC', 'B', 'C'), link('CD', 'C', 'D'), link('AD', 'A', 'D')],
    );
    expect(r.offenders.find((o) => o.linkId === 'AD')?.via).toEqual(['B', 'C']);
  });
});

describe('totality, determinism and bounds', () => {
  it('zero links: nothing flagged, nothing unjudged', () => {
    expect(flag([task('A')], [])).toEqual({
      offenders: [],
      unjudged: 0,
      searchCapped: false,
      cyclic: false,
    });
  });

  it('a link to an activity that is not there is counted, never thrown on', () => {
    const input = buildRuleInput({
      dataDate: '2026-01-05',
      calendars: CALENDAR_SHAPES,
      planCalendar: 'MON_FRI',
      activities: [task('A'), task('B')],
      links: [link('AB', 'A', 'B')],
    });
    const r = run({
      ...input,
      dependencies: [
        ...input.dependencies,
        { ...input.dependencies[0]!, id: 'X', successorId: 'ghost' },
      ],
    });
    expect(ids(r)).toEqual([]);
    expect(r.unjudged).toBe(1);
  });

  it('a stored cycle flags nothing and counts every link', () => {
    const input = buildRuleInput({
      dataDate: '2026-01-05',
      calendars: CALENDAR_SHAPES,
      planCalendar: 'MON_FRI',
      activities: [task('A'), task('B')],
      links: [link('AB', 'A', 'B')],
    });
    const r = run({
      ...input,
      dependencies: [
        ...input.dependencies,
        { ...input.dependencies[0]!, id: 'BA', predecessorId: 'B', successorId: 'A' },
      ],
    });
    expect(r).toEqual({ offenders: [], unjudged: 2, searchCapped: false, cyclic: true });
  });

  it('a budget of one stops early, flags nothing it did not finish, and says so', () => {
    const triangle = {
      activities: [task('A'), task('B'), task('C')],
      links: [link('AB', 'A', 'B'), link('BC', 'B', 'C'), link('AC', 'A', 'C')],
    };
    const r = flag(triangle.activities, triangle.links, {}, 1);
    expect(r.searchCapped).toBe(true);
    expect(ids(r)).toEqual([]);
    // Every link that was a candidate and was not reached is counted: all three end at a
    // transparent successor, so all three were left unchecked.
    expect(r.unjudged).toBe(3);
  });

  it('the answer does not depend on the order the rows arrive in', () => {
    const input = buildRuleInput({
      dataDate: '2026-01-05',
      calendars: CALENDAR_SHAPES,
      planCalendar: 'MON_FRI',
      activities: [task('A'), task('B'), task('C'), task('D')],
      links: [
        link('AB', 'A', 'B'),
        link('BC', 'B', 'C'),
        link('AC', 'A', 'C'),
        link('CD', 'C', 'D'),
        link('BD', 'B', 'D'),
        link('AD', 'A', 'D'),
      ],
    });
    const reversed: RuleInput = {
      activities: [...input.activities].reverse(),
      dependencies: [...input.dependencies].reverse(),
    };
    expect(run(reversed).offenders.map((o) => o.linkId)).toEqual(
      run(input).offenders.map((o) => o.linkId),
    );
    expect(run(reversed).unjudged).toBe(run(input).unjudged);
  });

  it('offenders are sorted by predecessor label, successor label, then id', () => {
    const r = flag(
      [task('B'), task('A'), task('C'), task('D')],
      [
        link('AB', 'A', 'B'),
        link('BC', 'B', 'C'),
        link('AC', 'A', 'C'),
        link('CD', 'C', 'D'),
        link('BD', 'B', 'D'),
        link('AD', 'A', 'D'),
      ],
    );
    expect(ids(r)).toEqual(['AC', 'AD', 'BD']);
  });
});

describe('the fixture (spec E14, E15)', () => {
  const edgeOf = (spec: SeedSpec): string | undefined => {
    const index = spec.dependencies.findIndex(
      (d) =>
        spec.activities.find((a) => a.key === d.predecessorKey)?.code === 'A4110' &&
        spec.activities.find((a) => a.key === d.successorKey)?.code === 'A4600',
    );
    return index < 0 ? undefined : `edge-${String(index)}`;
  };

  it('R0056 (A4110 to A4600) is flagged on the unprogressed fixture (spec SC-2, with W5 relaxed)', () => {
    // Every route from A4110 to A4600 leaves an activity at its start (`SS 2400`) or carries a lead, so
    // only single-calendar mode can pass it. The fixture's activities schedule on CAL-02 and its
    // project-default lags are on the plan calendar CAL-01. As first written W5 wanted those lags on
    // CAL-02 and refused; the product owner relaxed that for a non-positive D lag (2026-10-17), after the
    // oracle found no counterexample, and this is the case that made the difference.
    const spec = fixtureSpec();
    const unprogressed: SeedSpec = {
      ...spec,
      activities: spec.activities.map((a) => ({ ...a, progress: null })),
    };
    const id = edgeOf(unprogressed);
    expect(id).toBeDefined();
    expect(ids(run(ruleInputOfSpec(unprogressed)))).toContain(id);
  });

  it('R0056 is not flagged on the seeded fixture: its chain passes through started work (CQ-4)', () => {
    const spec = fixtureSpec();
    const id = edgeOf(spec);
    expect(id).toBeDefined();
    expect(ids(run(ruleInputOfSpec(spec)))).not.toContain(id);
  });
});
