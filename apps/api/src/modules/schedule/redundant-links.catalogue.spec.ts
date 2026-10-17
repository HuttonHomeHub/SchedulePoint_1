import { describe, expect, it } from 'vitest';

import {
  REDUNDANT_LOGIC_FLAGGED,
  REDUNDANT_LOGIC_UNCHECKED,
  redundantLogicCalendarsPlan,
  redundantLogicKeptPlan,
  redundantLogicPlan,
  redundantLogicUncheckedPlan,
} from '../../../../seed-cli/src/capabilities/logic';
import {
  engineDivergences,
  engineGraphOfSpec,
  ruleInputOfSpec,
} from '../../../test/support/redundant-links-oracle';

import { DEFAULT_RELAXATION_LIMIT, findRedundantLinks } from './health/redundant-links';

/**
 * **The four `capability-redundant-logic*` plans, held to the rule and to the engine**
 * (redundant-link-advisory M3-T1).
 *
 * Each plan's description says which links the health check must list. This asserts the rule agrees
 * with that list exactly, link by link, with the count of links it cannot check, and that the engine
 * agrees with the rule: removing the listed links, alone and together, moves nothing. If a plan, the
 * rule or a description drift, one of these fails naming the cluster.
 */
const plans = [
  redundantLogicPlan(),
  redundantLogicCalendarsPlan(),
  redundantLogicKeptPlan(),
  redundantLogicUncheckedPlan(),
];

describe.each(plans.map((spec) => [spec.seedName, spec] as const))('%s', (name, spec) => {
  const key = name as keyof typeof REDUNDANT_LOGIC_FLAGGED;
  const input = ruleInputOfSpec(spec);
  const result = findRedundantLinks(input.activities, input.dependencies, {
    relaxationLimit: DEFAULT_RELAXATION_LIMIT,
  });

  /** `pred>succ:TYPE`, the form the plans' lists are written in. */
  const nameOf = (linkId: string): string => {
    const d = input.dependencies.find((x) => x.id === linkId)!;
    return `${d.predecessorId}>${d.successorId}:${d.type}`;
  };

  it('flags exactly the links the plan says it does', () => {
    expect(result.offenders.map((o) => nameOf(o.linkId)).sort()).toEqual(
      [...REDUNDANT_LOGIC_FLAGGED[key]].sort(),
    );
  });

  it('counts the links it cannot check, and is not capped', () => {
    expect(result.unjudged).toBe(REDUNDANT_LOGIC_UNCHECKED[key]);
    expect(result.searchCapped).toBe(false);
  });

  it('names every flagged cluster in its description', () => {
    for (const id of REDUNDANT_LOGIC_FLAGGED[key]) {
      expect(spec.plan.description ?? '', id).toContain(id.match(/^R\d+/)![0]);
    }
  });

  it('removing the flagged links, alone and together, moves no date or float in the engine', () => {
    const flagged = result.offenders.map((o) => o.linkId);
    expect(engineDivergences(engineGraphOfSpec(spec), flagged)).toEqual([]);
  });
});

describe('witnesses', () => {
  it('names the middle activity, or the parallel link', () => {
    const triangle = ruleInputOfSpec(redundantLogicPlan());
    const found = findRedundantLinks(triangle.activities, triangle.dependencies, {
      relaxationLimit: DEFAULT_RELAXATION_LIMIT,
    });
    expect(found.offenders.find((o) => o.via.includes('R1B'))).toBeDefined();

    const same = ruleInputOfSpec(redundantLogicCalendarsPlan());
    const parallel = findRedundantLinks(same.activities, same.dependencies, {
      relaxationLimit: DEFAULT_RELAXATION_LIMIT,
    });
    expect(parallel.offenders.find((o) => o.parallelType === 'FS')).toBeDefined();
  });
});
