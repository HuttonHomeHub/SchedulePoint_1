// @ts-check
/**
 * Fixtures for `build-steps.mjs` — the rule `check-build-contract.mjs` uses to read the CI
 * workflow's "Build shared packages" steps.
 *
 * **The case that matters is the two-step one**, and it is written from a defect that was observed
 * rather than imagined. `docs/specs/ci-sharding/` M2 split the end-to-end work into two jobs, each
 * with its own build step; the gate's single non-global `RegExp.exec` then checked the first and
 * was silent about the second. Verified by deleting `@repo/layout` from the second step in the real
 * workflow: the gate printed `Build contract OK — 5 shared package(s) built by every consumer`.
 *
 * That is the shape worth pinning, because it is invisible from both sides — the workflow looks
 * complete, the gate reports success, and the failure surfaces minutes into a CI run as a missing
 * module that exists.
 *
 * Run standalone: `node scripts/lib/build-steps.test.mjs`
 */

import assert from 'node:assert/strict';

import { buildStepsIn, missingFrom } from './build-steps.mjs';

let run = 0;
let failed = 0;
const it = (what, fn) => {
  run += 1;
  try {
    fn();
  } catch (err) {
    failed += 1;
    process.stdout.write(`  ✗ ${what}\n    ${err.message}\n`);
    process.exitCode = 1;
  }
};

const step = (run_) => `      - name: Build shared packages\n        run: ${run_}\n`;
const builds = (...pkgs) => pkgs.map((p) => `pnpm --filter ${p} build`).join(' && ');

it('finds EVERY build step, not the first — the M2 two-job case', () => {
  // Verified red against the previous implementation: a non-global `exec` returns one match and
  // reports nothing about the rest, so the second job's step was unchecked and unmentioned.
  const ci = step(builds('@repo/types', '@repo/layout')) + '\n' + step(builds('@repo/types'));
  const steps = buildStepsIn(ci);
  assert.equal(steps.length, 2);
  assert.equal(missingFrom(steps[0], ['@repo/types', '@repo/layout']).length, 0);
  assert.deepEqual(missingFrom(steps[1], ['@repo/types', '@repo/layout']), ['@repo/layout']);
});

it('returns an empty list when there is no build step at all', () => {
  // The caller turns this into a finding rather than a pass. With zero occurrences the caller's
  // loop is vacuously satisfied, so "every package is built" and "nothing builds anything" are the
  // same result unless somebody checks the count (ADR-0093).
  assert.deepEqual(buildStepsIn('      - name: Something else\n        run: echo\n'), []);
});

it('reads the command, not the step name', () => {
  // A step title is prose. The contract is about what runs.
  const [only] = buildStepsIn(step(builds('@repo/seed')));
  assert.equal(only, builds('@repo/seed'));
});

it('missingFrom names every absent package, sorted', () => {
  // Sorted so two identical failures read identically; an unstable order makes one defect look
  // like several.
  //
  // **The input here is deliberately in the WRONG order**, and the first version of this case was
  // not: it passed `['@repo/layout', '@repo/seed', '@repo/types']`, which is already sorted, so
  // filtering preserved it and deleting the `.sort()` left the case green. The mutation sweep
  // caught that — an assertion that cannot fail is not an assertion — which is the same lesson the
  // sibling gate's prefix guard taught an hour earlier in this epic.
  assert.deepEqual(
    missingFrom(builds('@repo/types'), ['@repo/seed', '@repo/types', '@repo/layout']),
    ['@repo/layout', '@repo/seed'],
  );
});

it('a package name that merely CONTAINS another is not mistaken for it', () => {
  // `@repo/seed` and `@repo/seed-http` are both real packages in this repository, and a substring
  // test on the bare name would call the second a match for the first. The `pnpm --filter <name>
  // build` form is what keeps them apart, so this pins the form rather than the intention.
  assert.deepEqual(missingFrom(builds('@repo/seed-http'), ['@repo/seed']), ['@repo/seed']);
});

process.stdout.write(
  failed > 0 ? `build-steps: FAILED (${run} cases)\n` : `build-steps: ${run} cases OK\n`,
);
