import { fixtureSpec, scaleSpec, type SeedSpec } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import { capabilitySpecs } from '../../../../seed-cli/src/capabilities/index';
import { referenceSpecs } from '../../../../seed-cli/src/references/index';
import {
  buildRuleInput,
  engineDivergences,
  engineGraphOfSpec,
  generatePlan,
  oracleDivergences,
  redrawDurations,
  ruleInputOfSpec,
  type Divergence,
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
