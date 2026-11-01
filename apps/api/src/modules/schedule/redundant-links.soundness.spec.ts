import { fixtureSpec, scaleSpec, type SeedSpec } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import { capabilitySpecs } from '../../../../seed-cli/src/capabilities/index';
import { referenceSpecs } from '../../../../seed-cli/src/references/index';
import {
  buildRuleInput,
  CALENDAR_SHAPES,
  engineDivergences,
  engineGraphOfSpec,
  generatePlan,
  oracleDivergences,
  redrawDurations,
  ruleInputOfSpec,
  type Divergence,
  type OracleActivity,
  type OracleLink,
  type OraclePlan,
} from '../../../test/support/redundant-links-oracle';

import { findRedundantLinks } from './health/redundant-links';

/**
 * **SC-1, the soundness claim, run against the real engine** (redundant-link-advisory M2-T1 and spec
 * §4.7): every link the rule flags, removed alone **and** all flagged links removed together, leaves
 * every per-activity date and float the engine persists unchanged — over the whole catalogue, the
 * fixture progressed and unprogressed, and a seeded population of random plans, each drawn five times
 * with different durations.
 *
 * It lives beside the rule's own cases, not inside them, because it is the one suite that can fail
 * for a reason the rule's author did not think of: it asks the engine.
 */
const BUDGET = 1_000_000_000;

const find = (input: ReturnType<typeof buildRuleInput>) =>
  findRedundantLinks(input.activities, input.dependencies, { relaxationLimit: BUDGET });

const show = (found: Divergence[]): string =>
  found
    .slice(0, 6)
    .map((d) => `${d.scope} ${d.subject}.${d.field}: ${String(d.before)} -> ${String(d.after)}`)
    .join('\n');

/** The fixture with its progress taken out: the conformance S01 baseline the spec names (E15). */
function unprogressed(spec: SeedSpec): SeedSpec {
  return {
    ...spec,
    activities: spec.activities.map((a) => ({ ...a, progress: null })),
  };
}

describe('SC-1 — the rule is sound against the engine', () => {
  it('the seeded population: 500 plans, five duration draws each, alone and all at once', () => {
    let flaggedTotal = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const base = generatePlan(seed, { dense: seed % 2 === 0 });
      for (let draw = 0; draw < 5; draw += 1) {
        const plan = draw === 0 ? base : redrawDurations(base, seed * 100 + draw);
        const flagged = find(buildRuleInput(plan)).offenders.map((o) => o.linkId);
        flaggedTotal += flagged.length;
        const found = oracleDivergences(plan, flagged);
        expect(found, `seed ${String(seed)} draw ${String(draw)}\n${show(found)}`).toEqual([]);
      }
    }
    // The population is only a test of the rule if the rule flags something in it.
    expect(flaggedTotal).toBeGreaterThan(100);
  }, 600_000);

  it('three thousand random triangles, the smallest network the rule can judge', () => {
    let flagged = 0;
    for (let seed = 10_000; seed < 13_000; seed += 1) {
      const plan = generatePlan(seed, { triangle: true });
      const ids = find(buildRuleInput(plan)).offenders.map((o) => o.linkId);
      flagged += ids.length;
      const found = oracleDivergences(plan, ids);
      expect(found, `triangle seed ${String(seed)}\n${show(found)}`).toEqual([]);
    }
    expect(flagged).toBeGreaterThan(100);
  }, 600_000);

  const catalogue: Array<[string, SeedSpec]> = [
    ['fixture (progressed)', fixtureSpec()],
    ['fixture (unprogressed)', unprogressed(fixtureSpec())],
    ...capabilitySpecs().map((s): [string, SeedSpec] => [s.seedName, s]),
    ...referenceSpecs().map((s): [string, SeedSpec] => [s.seedName, s]),
    ['scale-500', scaleSpec({ activities: 500 })],
  ];

  it.each(catalogue)(
    '%s',
    (_name, spec) => {
      const flagged = findRedundantLinks(
        ruleInputOfSpec(spec).activities,
        ruleInputOfSpec(spec).dependencies,
        { relaxationLimit: BUDGET },
      ).offenders.map((o) => o.linkId);
      const found = engineDivergences(engineGraphOfSpec(spec), flagged);
      expect(found, show(found)).toEqual([]);
    },
    600_000,
  );
});

/**
 * **An intermediate left at its start (TECH_DEBT #557).** W2's cross-calendar form once refused any
 * chain that left an intermediate at its start. The exclusion's first counterexample (CE2) rested on
 * a milestone behaviour ADR-0207 removed, and a search of calendars and durations found a replacement
 * with A and C on the plan calendar and B on another. The rule now lets such a chain through when the
 * intermediate schedules on the source's calendar. These cases pin both edges: the witness stays
 * unflagged (and the oracle shows removing its link really does move A), and the shape the narrowing
 * admits is flagged and the engine agrees.
 */
describe('W2: an intermediate left at its start (TECH_DEBT #557)', () => {
  const DAY = 1440;
  const task = (id: string, durationMinutes: number, calendar?: string): OracleActivity => ({
    id,
    durationMinutes,
    ...(calendar === undefined ? {} : { calendar }),
  });
  const link = (
    id: string,
    from: string,
    to: string,
    type: OracleLink['type'] = 'FS',
  ): OracleLink => ({ id, from, to, type, lagMinutes: 0 });
  const milestone: OracleActivity = { id: 'M', durationMinutes: 0, type: 'FINISH_MILESTONE' };
  const plan = (activities: OracleActivity[], links: OracleLink[]): OraclePlan => ({
    dataDate: '2026-01-05',
    calendars: CALENDAR_SHAPES,
    planCalendar: 'MON_FRI',
    activities,
    links,
  });
  const flaggedIn = (p: OraclePlan): string[] =>
    find(buildRuleInput(p)).offenders.map((o) => o.linkId);

  // A and C on the plan calendar, B on the office calendar, entered at B's start and left at it.
  const witness = plan(
    [
      task('A', 60),
      task('B', 480, 'OFFICE'),
      task('C', DAY),
      task('E', 6 * DAY, 'MON_SAT'),
      milestone,
    ],
    [
      link('AB', 'A', 'B'),
      link('BC', 'B', 'C', 'SS'),
      link('AC', 'A', 'C'),
      link('CM', 'C', 'M'),
      link('EM', 'E', 'M'),
    ],
  );

  it('the replacement witness is not flagged, and the engine says why (A moves)', () => {
    // Red first: with the exclusion lifted to "left at either end" the rule flags AC, and the oracle
    // run below is exactly the divergence that makes that unsound (A's late finish and total float).
    expect(flaggedIn(witness)).not.toContain('AC');
    const found = oracleDivergences(witness, ['AC']);
    expect(found.map((d) => `${d.subject}.${d.field}`)).toEqual(
      expect.arrayContaining(['A.lateFinish', 'A.totalFloat']),
    );
  });

  it('the same chain with B on the source calendar is flagged, and removing the link moves nothing', () => {
    const p = plan(
      [
        task('A', 60, 'OFFICE'),
        task('B', 480, 'OFFICE'),
        task('C', DAY),
        task('E', 6 * DAY, 'MON_SAT'),
        milestone,
      ],
      [
        link('AB', 'A', 'B'),
        link('BC', 'B', 'C', 'SS'),
        link('AC', 'A', 'C'),
        link('CM', 'C', 'M'),
        link('EM', 'E', 'M'),
      ],
    );
    expect(flaggedIn(p)).toEqual(['AC']);
    expect(oracleDivergences(p, ['AC'])).toEqual([]);
  });

  it('a two-intermediate chain is flagged only while the one left at its start is on the source calendar', () => {
    const chain = (b: string, f: string) =>
      plan(
        [
          task('A', 60),
          task('B', 60, b),
          task('F', 60, f),
          task('C', DAY),
          task('E', 6 * DAY, 'MON_SAT'),
          milestone,
        ],
        [
          link('AB', 'A', 'B'),
          link('BF', 'B', 'F'),
          link('FC', 'F', 'C', 'SS'),
          link('AC', 'A', 'C'),
          link('CM', 'C', 'M'),
          link('EM', 'E', 'M'),
        ],
      );
    const unsound = chain('MON_FRI', 'HALF_SAT');
    expect(flaggedIn(unsound)).not.toContain('AC');
    expect(oracleDivergences(unsound, ['AC']).length).toBeGreaterThan(0);
    const sound = chain('MON_FRI', 'MON_FRI');
    expect(flaggedIn(sound)).toContain('AC');
    expect(oracleDivergences(sound, ['AC'])).toEqual([]);
  });
});
