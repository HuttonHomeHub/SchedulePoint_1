import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { seedSpecSchema } from '../spec.js';

import { negativeCases } from './cases.js';
import { NEGATIVE_EXPECTATIONS, satisfies } from './model.js';

/**
 * The negative tier's structural gate (ADR-0066 M5.1).
 *
 * The failure this exists to prevent is the quiet one: a case in `negative_cases.json` that has no
 * attempt here. The catalogue would still run, still report "all cases behaved", and simply never
 * try the hostile write — which is indistinguishable from a product that handles it correctly. So
 * the fixture is read at test time and every case id must be present, with the expectation it
 * actually declares rather than one that was copied once and then drifted.
 */

interface FixtureCase {
  id: string;
  expect: string;
  description?: string;
  assertion?: string;
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../engine-conformance/fixtures/negative_cases.json', import.meta.url),
    ),
    'utf8',
  ),
) as { cases: FixtureCase[] };

describe('negative cases', () => {
  it('covers every case in the conformance fixture, with no invented ones', () => {
    const declared = fixture.cases.map((item) => item.id).sort();
    const attempted = negativeCases()
      .map((item) => item.id)
      .sort();
    // Both directions. A missing case is a hole in the catalogue; an extra one is a case with no
    // source, which would be asserting something nobody agreed to.
    expect(attempted).toEqual(declared);
  });

  it('carries each fixture expectation verbatim rather than a reinterpretation', () => {
    const declared = new Map(fixture.cases.map((item) => [item.id, item.expect]));
    const drifted = negativeCases()
      .filter((item) => declared.get(item.id) !== item.expect)
      .map((item) => `${item.id}: fixture says ${declared.get(item.id)}, case says ${item.expect}`);
    // The expectation is the contract. Narrowing REJECT_OR_WARN to REJECT because that is what the
    // code happens to do today is exactly the drift ADR-0058 is about, and it would make the tier
    // report agreement with itself.
    expect(drifted).toEqual([]);
  });

  it('uses only expectations the vocabulary knows', () => {
    const known = new Set<string>(NEGATIVE_EXPECTATIONS);
    expect(fixture.cases.filter((item) => !known.has(item.expect)).map((c) => c.expect)).toEqual(
      [],
    );
  });

  it('gives every case a host plan that is itself valid', () => {
    // The host must seed cleanly, or the attempt never happens and the case reports INCONCLUSIVE —
    // a hostile write that was never made proves nothing either way.
    const invalid = negativeCases()
      .map((item) => ({ id: item.id, parsed: seedSpecSchema.safeParse(item.host) }))
      .filter((item) => !item.parsed.success)
      .map((item) => `${item.id}: ${JSON.stringify(item.parsed.error?.issues)}`);
    expect(invalid).toEqual([]);
  });

  it('names only activities and resources its host actually contains', () => {
    const dangling: string[] = [];
    for (const item of negativeCases()) {
      const keys = new Set(item.host.activities.map((activity) => activity.key));
      const resources = new Set(item.host.resources.map((resource) => resource.key));
      const { attempt } = item;
      if (attempt.kind === 'create-dependency') {
        if (!keys.has(attempt.predecessorKey))
          dangling.push(`${item.id}: ${attempt.predecessorKey}`);
        // The dangling successor is the point of N05, so it is exempt by design.
        if (attempt.danglingSuccessor !== true && !keys.has(attempt.successorKey)) {
          dangling.push(`${item.id}: ${attempt.successorKey}`);
        }
      }
      if (attempt.kind === 'set-progress' && !keys.has(attempt.activityKey)) {
        dangling.push(`${item.id}: ${attempt.activityKey}`);
      }
      if (attempt.kind === 'assign-resource') {
        if (!keys.has(attempt.activityKey)) dangling.push(`${item.id}: ${attempt.activityKey}`);
        if (!resources.has(attempt.resourceKey))
          dangling.push(`${item.id}: ${attempt.resourceKey}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('has a distinct host plan name per case, so a run does not collide with itself', () => {
    const names = negativeCases().map((item) => item.host.plan.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('treats an accepted REJECT case as unsatisfied — the rule the tier exists for', () => {
    // The one judgement that must never soften. If this ever returns true, a plan the conformance
    // fixture says must not exist would be reported as fine.
    expect(satisfies('REJECT', 'ACCEPTED')).toBe(false);
    expect(satisfies('REJECT_WITH_CYCLE_REPORT', 'ACCEPTED')).toBe(false);
    expect(satisfies('REJECT', 'REJECTED')).toBe(true);
    // And a case that never ran is never a pass, whatever it expected.
    for (const expectation of NEGATIVE_EXPECTATIONS) {
      expect(satisfies(expectation, 'INCONCLUSIVE')).toBe(false);
    }
  });
});
