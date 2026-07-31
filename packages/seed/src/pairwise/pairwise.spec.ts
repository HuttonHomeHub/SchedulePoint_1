import { describe, expect, it } from 'vitest';

import { seedSpecSchema } from '../spec.js';

import { pairwiseSuite } from './cases.js';
import { PAIRWISE_RULES, isLegal } from './constraints.js';
import { buildCoveringArray } from './covering-array.js';
import { DIMENSIONS, reachableValues, unreachableValues } from './dimensions.js';

/**
 * The generator's own gate (ADR-0066 M3.1). Its stated risk is **silent exclusions hiding a real
 * gap** — an excluded pair and an uncovered pair look identical from outside, so a generator that
 * quietly drops what it cannot handle reports the same green as one that covers everything.
 *
 * So the assertions below are about the *accounting*: every legal pair is covered, every excluded
 * pair names the rule that excluded it, and every unreachable value names why.
 */
describe('the covering array', () => {
  const array = buildCoveringArray();

  it('covers every legal pair', () => {
    // The assertion is the LIST. A count would say "something is uncovered"; the list says which
    // interaction stopped being tested, which is the only form of that message worth having.
    expect(array.uncovered).toEqual([]);
  });

  it('stays in the tens of cases, which is the whole point of pairwise', () => {
    // An exhaustive cross of this table is ~10^12 rows. If this number ever approaches the hundreds
    // the greedy step has stopped working and the suite has quietly become a different thing.
    expect(array.rows.length).toBeGreaterThan(10);
    expect(array.rows.length).toBeLessThan(200);
  });

  it('generates only legal rows', () => {
    for (const row of array.rows) {
      expect(isLegal(row), JSON.stringify(row)).toBe(true);
    }
  });

  it('gives every row a value for every dimension', () => {
    for (const row of array.rows) {
      for (const dimension of DIMENSIONS) {
        expect(reachableValues(dimension), `${dimension.id} in ${JSON.stringify(row)}`).toContain(
          row[dimension.id],
        );
      }
    }
  });

  it('names the rule behind every excluded pair', () => {
    const ruleIds = new Set(PAIRWISE_RULES.map((rule) => rule.id));
    for (const { rule } of array.excluded) {
      expect(ruleIds.has(rule.id)).toBe(true);
      expect(rule.reason.length).toBeGreaterThan(30);
    }
    // Every rule declared must actually forbid something. A rule that excludes nothing is either
    // wrong or describes an invariant that has since changed — both worth knowing, and both
    // invisible if the rule simply sits there passing.
    const exercised = new Set(array.excluded.map((entry) => entry.rule.id));
    const inert = PAIRWISE_RULES.filter((rule) => !exercised.has(rule.id)).map((rule) => rule.id);
    expect(inert).toEqual([]);
  });

  it('is deterministic — the same table produces the same rows every run', () => {
    // A greedy search with an arbitrary tie-break would make a failing case disappear on re-run,
    // which turns an intermittent product defect into an intermittent suite.
    expect(buildCoveringArray().rows).toEqual(array.rows);
  });
});

describe('unreachable values', () => {
  it('are declared with a reason rather than deleted from the table', () => {
    const unreachable = unreachableValues();
    // Deleting them would make the table describe a smaller product than the engine is, and the
    // next reader would have no way to tell the difference. These are the ADR-0036 calendar shapes
    // the engine implements and no write path can create (TECH_DEBT #79/#80).
    expect(unreachable.length).toBeGreaterThan(0);
    for (const entry of unreachable) {
      expect(entry.reason.length, entry.value).toBeGreaterThan(30);
    }
    expect(unreachable.map((entry) => entry.value)).toContain('window-only');
    expect(unreachable.map((entry) => entry.value)).toContain('shift-night');
  });

  it('never appear in a generated case', () => {
    const banned = new Set(unreachableValues().map((entry) => `${entry.dimension}=${entry.value}`));
    for (const row of buildCoveringArray().rows) {
      for (const [dimension, value] of Object.entries(row)) {
        expect(banned.has(`${dimension}=${value}`)).toBe(false);
      }
    }
  });

  it('leave every dimension with something to vary', () => {
    // A dimension whose every value became unreachable would silently stop being a dimension.
    for (const dimension of DIMENSIONS) {
      expect(reachableValues(dimension).length, dimension.id).toBeGreaterThan(1);
    }
  });
});

describe('the generated cases', () => {
  const { cases } = pairwiseSuite();

  it('are valid seed specs', () => {
    for (const item of cases) {
      expect(() => seedSpecSchema.parse(item.spec), item.caseId).not.toThrow();
    }
  });

  it('have unique seed names, so two cases cannot collide into one plan', () => {
    const names = cases.map((item) => item.spec.seedName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('carry their dimensions in the plan description', () => {
    // A case that diverges is read by a person, and the fastest question they can ask is "what is
    // different about this one". Keeping the answer on the plan means no lookup table to consult.
    for (const item of cases) {
      expect(item.spec.plan.description, item.caseId).toContain('activityType=');
      expect(item.spec.plan.description, item.caseId).toContain(item.assignment.constraint ?? '');
    }
  });

  it('give a milestone or an LOE no duration of its own', () => {
    for (const item of cases) {
      const subject = item.spec.activities.find((a) => a.key === 'SUBJ');
      const zeroKinds = ['START_MILESTONE', 'FINISH_MILESTONE', 'LEVEL_OF_EFFORT'];
      if (subject !== undefined && zeroKinds.includes(subject.type)) {
        expect(subject.durationMinutes, item.caseId).toBe(0);
      }
    }
  });

  it('give a resource a calendar only when it is driving, and only an ORG one', () => {
    for (const item of cases) {
      const scopeByKey = new Map(item.spec.calendars.map((c) => [c.key, c.scope]));
      for (const resource of item.spec.resources) {
        // ADR-0053 §2: a project calendar on a resource is a hard 422, so a case carrying one would
        // fail the seed for a reason that says nothing about the dimensions it was built to cross.
        if (resource.calendarKey !== null) {
          expect(scopeByKey.get(resource.calendarKey), item.caseId).toBe('ORG');
        }
      }
    }
  });

  it('keep the same four-activity shape in every case', () => {
    // A shape that varied per case would make every comparison against a neighbour start over.
    for (const item of cases) {
      expect(
        item.spec.activities.map((a) => a.key),
        item.caseId,
      ).toEqual(['PRED', 'SUBJ', 'SUCC', 'ANCHOR']);
      expect(item.spec.dependencies, item.caseId).toHaveLength(2);
    }
  });
});
