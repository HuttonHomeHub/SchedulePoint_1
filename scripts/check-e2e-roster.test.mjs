// @ts-check
/**
 * Fixtures for `check-e2e-roster.mjs` — **and every case names the mutation that made it red.**
 *
 * ADR-0110 D5 is the standard: *a gate is not finished when it passes; it is finished when it has
 * been made to fail by the defect it was written for.* That is not ceremony here. ADR-0110 records
 * a WCAG target-size sweep that was written with both of its predecessor's recorded traps in mind
 * and **still could not see a split button's caret** — the exact control class it existed to
 * protect — and reported green for it. A gate's own author is the worst-placed person to judge
 * whether it discriminates, so each case below is run against the defect rather than reasoned about.
 *
 * **The whole gate runs against a synthetic tree**, through the same `runGate(root)` the CLI calls,
 * `report()` included. `stack-record.structural.test.ts` asserted against a private mirror of the
 * logic it was named for and would have stayed green through the regression its own docblock
 * described; the sibling gates in this directory take this shape for that reason.
 *
 * **E4 and E5 are absent because the shards are** (Milestone 3). A case pinning a rule the product
 * does not have yet asserts nothing.
 *
 * Run standalone: `node scripts/check-e2e-roster.test.mjs`
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { declaredSuites, invocationsIn, project, runGate } from './check-e2e-roster.mjs';

/** Build a throwaway repository root from a `{ 'path/from/root': contents }` map. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'e2e-roster-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const pkg = (...scripts) =>
  JSON.stringify({ scripts: Object.fromEntries(scripts.map((s) => [s, 'playwright test'])) });

const workflow = (body) => `name: CI\njobs:\n  e2e:\n    steps:\n${body}`;
const step = (filter, script, title = 'End-to-end tests') =>
  `      - name: ${title}\n        run: pnpm --filter ${filter} ${script}\n`;

/** The smallest tree the gate calls valid: both workspaces declared, every script wired once. */
const base = (extra = {}) => ({
  'apps/web/package.json': pkg('test:e2e', 'test:e2e:minimap'),
  'apps/api/package.json': pkg('test:e2e', 'test:e2e:pairwise'),
  '.github/workflows/ci.yml': workflow(
    step('@repo/web', 'test:e2e') +
      step('@repo/web', 'test:e2e:minimap') +
      step('@repo/api', 'test:e2e') +
      step('@repo/api', 'test:e2e:pairwise'),
  ),
  ...extra,
});

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

/** Run the gate quietly — its own output would drown the suite's. */
function run(root) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return runGate(root);
  } finally {
    process.stdout.write = write;
  }
}

const check = (files, expected) => {
  const root = tree(files);
  try {
    assert.equal(run(root), expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

// ------------------------------------------------------------------- the pinned positive case

it('the pinned positive case — every suite wired exactly once PASSES', () => {
  // Without this, "nothing unwired" is indistinguishable from "nothing found". ADR-0093's shape:
  // a green suite that cannot tell the estate being clean from the derivation being broken.
  check(base(), 0);
});

// ------------------------------------------------------------------------------ E1 / E2 / E3

it('E1 — a declared suite that no CI step runs FAILS', () => {
  // Verified red by removing the `count === 0` branch: the gate then reports 44 wired suites over
  // a workflow missing one, which is precisely the silence this gate exists to break.
  check(
    base({
      'apps/web/package.json': pkg('test:e2e', 'test:e2e:minimap', 'test:e2e:orphan'),
    }),
    1,
  );
});

it('E2 — a CI step naming a suite that does not exist FAILS', () => {
  // The rename-that-reached-one-file shape. It would also fail as a red CI step 40 minutes later;
  // the value of catching it here is that it fails before the round trip.
  check(
    base({
      '.github/workflows/ci.yml': workflow(
        step('@repo/web', 'test:e2e') +
          step('@repo/web', 'test:e2e:minimap') +
          step('@repo/web', 'test:e2e:renamed-away') +
          step('@repo/api', 'test:e2e') +
          step('@repo/api', 'test:e2e:pairwise'),
      ),
    }),
    1,
  );
});

it('E3 — a suite run by two CI steps FAILS', () => {
  // Verified red by asserting `count >= 1` instead of `count === 1`, which is the natural way to
  // write "is it wired?" and cannot see a duplicate at all.
  check(
    base({
      '.github/workflows/ci.yml': workflow(
        step('@repo/web', 'test:e2e') +
          step('@repo/web', 'test:e2e:minimap') +
          step('@repo/web', 'test:e2e:minimap', 'End-to-end tests (again)') +
          step('@repo/api', 'test:e2e') +
          step('@repo/api', 'test:e2e:pairwise'),
      ),
    }),
    1,
  );
});

// ---------------------------------------------------------------------------------- E6 / E7

it('E6 — a workspace declaring no end-to-end script at all FAILS on the population', () => {
  // The derivation being broken looks exactly like the estate being clean, unless something asserts
  // the population is non-empty.
  check(
    {
      'apps/web/package.json': pkg('build'),
      'apps/api/package.json': pkg('build'),
      '.github/workflows/ci.yml': workflow('      - name: nothing\n        run: echo\n'),
    },
    1,
  );
});

it("E7 — a '#' inside a quoted string makes the gate REFUSE rather than misread", () => {
  // It does not try harder and it does not guess. A gate that quietly starts reading its subject
  // wrong is worse than one that stops, because nothing announces the change.
  check(
    base({
      '.github/workflows/ci.yml': workflow(
        step('@repo/web', 'test:e2e') +
          step('@repo/web', 'test:e2e:minimap') +
          step('@repo/api', 'test:e2e') +
          step('@repo/api', 'test:e2e:pairwise') +
          '      - name: colour\n        run: echo "#ff0000"\n',
      ),
    }),
    1,
  );
});

it('an unreadable workflow FAILS closed, and says nothing below is about CI', () => {
  // Without this the gate reports every declared suite as unwired: a true-sounding flood of
  // findings with one real cause.
  const root = tree({
    'apps/web/package.json': pkg('test:e2e'),
    'apps/api/package.json': pkg('test:e2e', 'test:e2e:pairwise'),
  });
  try {
    assert.equal(run(root), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------- the comment and prefix defences

it('a suite named only in a COMMENT is not wired', () => {
  // check-ci-roster.mjs's docblock records the naive version reporting a deliberately-absent gate
  // as covered — by reading the sentence that documented its absence.
  check(
    base({
      '.github/workflows/ci.yml': workflow(
        step('@repo/web', 'test:e2e') +
          '      # pnpm --filter @repo/web test:e2e:minimap  (temporarily disabled)\n' +
          step('@repo/api', 'test:e2e') +
          step('@repo/api', 'test:e2e:pairwise'),
      ),
    }),
    1,
  );
});

it("a suffixed suite's step is read as that suite, not as the base", () => {
  const found = invocationsIn('run: pnpm --filter @repo/web test:e2e:minimap\n');
  assert.deepEqual(found, [{ workspace: '@repo/web', script: 'test:e2e:minimap' }]);
});

it("a merely SIMILAR script name is not read as the base 'test:e2e'", () => {
  // This is the case the `(?![:\w-])` guard exists for, and the first version of this suite got it
  // wrong: it pinned `test:e2e:minimap`, which the greedy optional group already handles, so the
  // guard could be deleted with every case still green. Found by mutating the gate rather than by
  // reading it — which is ADR-0110 D5's whole point, since a gate's author is the worst-placed
  // person to judge whether it discriminates.
  //
  // A hyphen is not a colon, and `test:e2extra` is not `test:e2e`. Without the guard both yield a
  // bare `test:e2e`, so the BASE suite reads as wired by a step running something else — and the
  // base is the one whose absence is hardest to notice, having no flag name to miss.
  assert.deepEqual(invocationsIn('run: pnpm --filter @repo/web test:e2e-smoke\n'), []);
  assert.deepEqual(invocationsIn('run: pnpm --filter @repo/web test:e2extra\n'), []);
});

it('matches the command, not the step title', () => {
  // A title is prose. This one lies, and the gate must not care.
  const found = invocationsIn(
    '      - name: Web end-to-end tests (minimap)\n        run: pnpm --filter @repo/web test:e2e:staff\n',
  );
  assert.deepEqual(found, [{ workspace: '@repo/web', script: 'test:e2e:staff' }]);
});

// --------------------------------------------------------------------------- the derivations

it('declaredSuites takes the base and every suffix, and nothing else', () => {
  assert.deepEqual(
    declaredSuites({
      scripts: { 'test:e2e': 'x', 'test:e2e:a': 'x', 'test:e2e-helper': 'x', build: 'x' },
    }),
    ['test:e2e', 'test:e2e:a'],
  );
});

it('project charges an unmeasured suite the WORST measured duration, never zero', () => {
  // A zero lets a new suite ride free in a packing, and a green projection cannot then be told from
  // an absent one.
  const p = project(['a', 'b', 'c'], { a: 10, b: 30 });
  assert.equal(p.total, 70); // 10 + 30 + 30, not 10 + 30 + 0
  assert.equal(p.estimated, 1);
});

it('project returns null when there is nothing to project from', () => {
  // Printing "0 s" over an absent durations file states a measurement that was never taken.
  assert.equal(project(['a'], undefined), null);
  assert.equal(project(['a'], {}), null);
});

for (const [name, fn] of cases) {
  try {
    fn();
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`  ✗ ${name}\n    ${error instanceof Error ? error.message : error}\n`);
  }
}
process.stdout.write(
  `check:e2e-roster tests: ${failures === 0 ? 'OK' : 'FAIL'} — ${cases.length - failures}/${cases.length} passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
