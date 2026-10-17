import { describe, expect, it } from 'vitest';

import {
  buildRuleInput,
  buildEngineGraph,
  CALENDAR_SHAPES,
  COMPARED_RESULT_FIELDS,
  generatePlan,
  oracleDivergences,
  redrawDurations,
  type Divergence,
  type OracleActivity,
  type OracleLink,
  type OraclePlan,
  type RuleInput,
} from '../../../test/support/redundant-links-oracle';

import { computeSchedule } from './engine';

/**
 * **The differential oracle, driven by deliberately unsound rules** (redundant-link-advisory M0-T2 and
 * M0-T3, spec §4.7).
 *
 * The oracle has no rule of its own; the rule under test is an argument. This suite proves two things
 * before any product code exists. First, that the harness can see a divergence at all, by driving it
 * with a **structural** predicate ("another path reaches the successor") that the spec rejects, on the
 * case the spec says it gets wrong. Second, that every exclusion in the rule is **necessary**: each
 * counterexample flags one link with a rule that is sound except for the clause under test, and the
 * engine disagrees.
 *
 * The expected divergences were written down before they were run
 * (`docs/specs/redundant-link-advisory/m0-measurement.md`); a case that did not diverge is recorded
 * there as "reasoned, not demonstrated" rather than dropped.
 */

const DATA_DATE = '2026-01-05'; // a Monday
const DAY = 1440;

function plan(
  activities: OracleActivity[],
  links: OracleLink[],
  overrides: Partial<OraclePlan> = {},
): OraclePlan {
  return {
    dataDate: DATA_DATE,
    calendars: CALENDAR_SHAPES,
    planCalendar: 'MON_FRI',
    activities,
    links,
    ...overrides,
  };
}

const task = (
  id: string,
  durationMinutes: number,
  extra: Partial<OracleActivity> = {},
): OracleActivity => ({ id, durationMinutes, ...extra });
const link = (
  id: string,
  from: string,
  to: string,
  type: OracleLink['type'] = 'FS',
  lagMinutes = 0,
  extra: Partial<OracleLink> = {},
): OracleLink => ({ id, from, to, type, lagMinutes, ...extra });

/**
 * The structural rule the spec rejects: a link is "redundant" when the successor is reachable from the
 * predecessor along some other path (for a parallel link, another link between the same pair).
 */
function structuralCandidates(input: RuleInput): string[] {
  const out = new Map<string, string[]>();
  for (const d of input.dependencies) {
    const list = out.get(d.predecessorId) ?? [];
    list.push(d.id);
    out.set(d.predecessorId, list);
  }
  const byId = new Map(input.dependencies.map((d) => [d.id, d] as const));
  const reaches = (from: string, to: string, skip: string): boolean => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length > 0) {
      const at = stack.pop()!;
      for (const id of out.get(at) ?? []) {
        if (id === skip) continue;
        const next = byId.get(id)!.successorId;
        if (next === to) return true;
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  };
  return input.dependencies
    .filter((d) => reaches(d.predecessorId, d.successorId, d.id))
    .map((d) => d.id);
}

const fieldsOf = (divergences: Divergence[], subject: string): string[] =>
  divergences.filter((d) => d.subject === subject).map((d) => d.field);

describe('the oracle can see a divergence (M0-T2)', () => {
  const triangle = (lag: number) =>
    plan(
      [task('A', DAY), task('B', DAY), task('C', DAY)],
      [link('AB', 'A', 'B'), link('BC', 'B', 'C'), link('AC', 'A', 'C', 'FS', lag)],
    );

  it('a structural rule flags R2 (A to C FS +5 days) and the oracle reports C moving', () => {
    const p = triangle(5 * DAY);
    const flagged = structuralCandidates(buildRuleInput(p));
    expect(flagged).toEqual(['AC']);
    const divergences = oracleDivergences(p, flagged);
    expect(fieldsOf(divergences, 'C')).toContain('earlyStart');
    expect(divergences.every((d) => d.scope === 'alone:AC')).toBe(true);
  });

  it('the same rule on R1 (A to C FS 0) flags the link and the oracle finds nothing', () => {
    const p = triangle(0);
    const flagged = structuralCandidates(buildRuleInput(p));
    expect(flagged).toEqual(['AC']);
    expect(oracleDivergences(p, flagged)).toEqual([]);
  });

  it('compares every engine output a recalculation persists (the ADR-0116 M6 lesson)', () => {
    // A harness that compares too few fields makes the proof narrower than its sentence. This fails
    // when the engine gains a per-activity output the oracle neither compares nor names as excluded.
    const g = buildEngineGraph(triangle(0));
    const result = computeSchedule(g.activities, g.edges, g.options).results[0]!;
    const excluded = new Set([
      'activityId', // the key, not an output
      'resourceDriverMissing', // an input echoed back, never moved by a link
    ]);
    const compared = new Set<string>(COMPARED_RESULT_FIELDS);
    const unaccounted = Object.keys(result).filter((k) => !compared.has(k) && !excluded.has(k));
    expect(unaccounted).toEqual([]);
    expect(compared.has('freeFloat')).toBe(true);
  });

  it('reports "all" when more than one link is removed together', () => {
    const p = plan(
      [task('A', DAY), task('B', DAY), task('C', DAY), task('D', DAY)],
      [
        link('AB', 'A', 'B'),
        link('BC', 'B', 'C'),
        link('CD', 'C', 'D'),
        link('AC', 'A', 'C', 'FS', 5 * DAY),
        link('BD', 'B', 'D', 'FS', 5 * DAY),
      ],
    );
    const scopes = new Set(oracleDivergences(p, ['AC', 'BD']).map((d) => d.scope));
    expect(scopes).toEqual(new Set(['alone:AC', 'alone:BD', 'all']));
  });

  it('an empty candidate set never diverges, on any generated plan', () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      expect(oracleDivergences(generatePlan(seed), [])).toEqual([]);
    }
  });

  it('the generator is deterministic, and a redraw keeps the network', () => {
    expect(generatePlan(7)).toEqual(generatePlan(7));
    const p = generatePlan(7);
    const q = redrawDurations(p, 99);
    expect(q.links).toEqual(p.links);
    expect(q.activities.map((a) => a.id)).toEqual(p.activities.map((a) => a.id));
  });

  it('a structural rule is caught diverging somewhere in a seeded population', () => {
    let divergent = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const p = generatePlan(seed);
      if (oracleDivergences(p, structuralCandidates(buildRuleInput(p))).length > 0) divergent += 1;
    }
    // Not a coverage claim: it shows the population is rich enough to expose an unsound rule.
    expect(divergent).toBeGreaterThan(0);
  });
});

describe('every exclusion is necessary (M0-T3)', () => {
  const diverges = (p: OraclePlan, linkId: string): Divergence[] => oracleDivergences(p, [linkId]);

  it('CE1 W2: an intermediate entered at its finish, across calendars', () => {
    const p = plan(
      [
        task('A', 5 * 540 + 240, { calendar: 'HALF_SAT' }),
        task('B', 60, { calendar: 'OFFICE' }),
        task('C', 60, { calendar: 'HALF_SAT' }),
      ],
      [link('AB', 'A', 'B', 'FF'), link('BC', 'B', 'C'), link('AC', 'A', 'C')],
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStart');
  });

  it('CE2 W2: an intermediate left at its start (the backward pass alone)', () => {
    // C is late on a Saturday; B's calendar is shut then, so the SS round trip lands B on Monday and
    // the chain bounds A less tightly than the direct link does. Only A's late dates move.
    const p = plan(
      [
        task('A', 60),
        task('B', 480, { calendar: 'OFFICE' }),
        task('C', DAY, { calendar: 'MON_SAT' }),
        task('E', 6 * DAY, { calendar: 'MON_SAT' }),
        task('M', 0, { type: 'FINISH_MILESTONE' }),
      ],
      [
        link('AB', 'A', 'B'),
        link('BC', 'B', 'C', 'SS'),
        link('AC', 'A', 'C'),
        link('CM', 'C', 'M'),
        link('EM', 'E', 'M'),
      ],
    );
    const found = diverges(p, 'AC');
    expect(fieldsOf(found, 'A')).toEqual(expect.arrayContaining(['lateFinish', 'totalFloat']));
    expect(found.some((d) => d.field === 'earlyStart' || d.field === 'earlyFinish')).toBe(false);
  });

  it('CE3 C transparent: NOT demonstrated by four constructions, so the exclusion stays', () => {
    // The spec reasons that a successor pinned or started early gives D a negative gap the chain does
    // not, moving A's free float. Measured, it does not: the engine pins such a successor's late dates
    // to its early ones, so the chain's total float is already at or below D's gap and free float
    // (capped by total float) reads the same either way. The exclusion is kept as conservative and
    // marked "reasoned, not demonstrated" in the ADR. If one of these starts to diverge, the engine
    // changed and the exclusion has become necessary rather than conservative.
    const abc = (c: Partial<OracleActivity>, extra: OracleActivity[] = []) =>
      plan(
        [task('A', 3 * DAY), task('B', DAY), task('C', DAY, c), ...extra],
        [
          link('AB', 'A', 'B'),
          link('BC', 'B', 'C'),
          link('AC', 'A', 'C'),
          ...extra.map((x) => link(`C${x.id}`, 'C', x.id)),
        ],
      );
    const tail = [task('X', 10 * DAY)];
    const cases: OraclePlan[] = [
      abc({ constraintType: 'MSO', constraintDate: '2026-01-06' }),
      abc({
        constraintType: 'MSO',
        constraintDate: '2026-01-06',
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-03-02',
      }),
      abc({ actualStart: '2026-01-05', remainingMinutes: DAY }, tail),
      abc({ actualStart: '2026-01-05', actualFinish: '2026-01-06' }, tail),
    ];
    for (const p of cases) expect(diverges(p, 'AC')).toEqual([]);
  });

  it('CE4 transparent: a started intermediate under Progress Override', () => {
    const p = plan(
      [
        task('A', 10 * DAY),
        task('B', 2 * DAY, { actualStart: '2026-01-02', remainingMinutes: DAY }),
        task('C', DAY),
      ],
      [link('AB', 'A', 'B'), link('BC', 'B', 'C'), link('AC', 'A', 'C')],
      { progressMode: 'PROGRESS_OVERRIDE' },
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStart');
  });

  it('CE5 transparent: a mandatory intermediate', () => {
    const p = plan(
      [
        task('A', 10 * DAY),
        task('B', DAY, { constraintType: 'MANDATORY_START', constraintDate: DATA_DATE }),
        task('C', DAY),
      ],
      [link('AB', 'A', 'B'), link('BC', 'B', 'C'), link('AC', 'A', 'C')],
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStart');
  });

  it('CE6 W4: positive lags on two keys, with equal sums', () => {
    // A ends Friday night. 960 minutes of working time on the plan calendar lands the following
    // Monday afternoon; 960 elapsed minutes lands Saturday and B waits for Monday morning. Both land
    // on the same date, so it is the offset, not the display date, that moves.
    const p = plan(
      [task('A', 5 * DAY), task('B', 60), task('C', DAY)],
      [
        link('AB', 'A', 'B', 'FS', 960, { lagCalendar: 'TWENTY_FOUR_HOUR' }),
        link('BC', 'B', 'C'),
        link('AC', 'A', 'C', 'FS', 960),
      ],
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStartOffset');
  });

  it('CE7 W4: a lag sum that falls short', () => {
    const p = plan(
      [task('A', DAY), task('B', 60), task('C', DAY)],
      [link('AB', 'A', 'B'), link('BC', 'B', 'C'), link('AC', 'A', 'C', 'FS', 5 * DAY)],
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStart');
  });

  it('CE8 W1: a lead on the chain', () => {
    const p = plan(
      [task('A', 3 * DAY), task('B', 60), task('C', DAY)],
      [link('AB', 'A', 'B', 'FS', -DAY), link('BC', 'B', 'C'), link('AC', 'A', 'C')],
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStart');
  });

  it('CE9 transparent: a level-of-effort intermediate', () => {
    const p = plan(
      [task('A', 3 * DAY), task('L', 0, { type: 'LEVEL_OF_EFFORT' }), task('C', DAY)],
      [link('AL', 'A', 'L'), link('LC', 'L', 'C'), link('AC', 'A', 'C')],
    );
    expect(fieldsOf(diverges(p, 'AC'), 'C')).toContain('earlyStart');
  });
});
