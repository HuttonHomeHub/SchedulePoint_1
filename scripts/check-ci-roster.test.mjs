// @ts-check
/**
 * Fixtures for `check-ci-roster.mjs` — **and every case names the mutation that made it red.**
 *
 * ADR-0110 D5 is the standard: *a gate is not finished when it passes; it is finished when it has
 * been made to fail by the defect it was written for.* That matters more than usual here, because
 * this gate's subject is **absence** and its population is a text file — the two conditions under
 * which a check most easily reports green over nothing.
 *
 * **The whole gate runs against a synthetic tree**, through the same `runGate(root)` the CLI calls,
 * `report()` included. A suite asserting against a private mirror of the rules would stay green
 * through exactly the regression it is named for.
 *
 * Run standalone: `node scripts/check-ci-roster.test.mjs`
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { runGate, SELF } from './check-ci-roster.mjs';

/**
 * Build a throwaway repository root from a `{ 'path/from/root': contents }` map.
 *
 * **A `scripts/prepush.sh` is written unless the caller supplies one**, because the gate now reads
 * the ADVISORY set out of it and refuses rather than treating an unreadable one as empty. The
 * default declares a name no other fixture uses, so it is inert for every case that is not about
 * advisory gates — and the cases that ARE pass their own.
 */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'ci-roster-'));
  if (!('scripts/prepush.sh' in files))
    files = { ...files, 'scripts/prepush.sh': prepush('check:nothing-here') };
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const pkg = (...gates) =>
  JSON.stringify({ scripts: Object.fromEntries(gates.map((g) => [g, 'node x.mjs'])) });

const workflow = (body) => `name: CI\njobs:\n  quality:\n    steps:\n${body}`;
const prepush = (...gates) =>
  `#!/usr/bin/env bash\nADVISORY_GATES=(${gates.map((g) => `"${g}"`).join(' ')})\n`;
const step = (gate) => `      - name: ${gate}\n        run: pnpm ${gate}\n`;

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

// ---------------------------------------------------------------- the four set assertions

it('R1 — a gate in package.json and in no CI step FAILS', () => {
  // Verified red by treating a missing gate as covered (dropping the `inCi.has` branch's else).
  const root = tree({
    'package.json': pkg('check:a', 'check:b'),
    '.github/workflows/ci.yml': workflow(step('check:a')),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('R1 — the same gate PASSES once exempt with a reason', () => {
  const root = tree({
    'package.json': pkg('check:a', 'check:b'),
    '.github/workflows/ci.yml': workflow(step('check:a')),
    'scripts/ci-roster.json': JSON.stringify({
      exempt: { 'check:b': 'Advisory by decision; it warns in prepush and never blocks.' },
    }),
  });
  assert.equal(run(root), 0);
  rmSync(root, { recursive: true, force: true });
});

it('R1 — an EMPTY reason is not a reason', () => {
  // The exemption file's whole value is the sentence in it. Verified red by accepting any key
  // present in `exempt`, which is the shape somebody in a hurry writes.
  const root = tree({
    'package.json': pkg('check:a'),
    '.github/workflows/ci.yml': workflow('      - name: nothing\n        run: echo\n'),
    'scripts/ci-roster.json': JSON.stringify({ exempt: { 'check:a': '   ' } }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('R3a — an ADVISORY gate running in CI FAILS, with no roster entry anywhere', () => {
  /**
   * **The back door, and the whole reason this assertion exists.** Three of the five M5 specialist
   * reviews reached this independently: add the CI step AND delete the `ci-roster.json` entry —
   * the natural pair of edits, since an entry reading "need not run in CI" looks redundant the
   * moment it does — and the gate reported OK. `check:advisory-agreement` could not see it either:
   * it compares `prepush.sh` against each gate's SOURCE and has never heard of `ci-roster.json`.
   *
   * CI has no advisory mode. GitHub Actions treats exit 2 as a failed job, so the step silently
   * converts ADR-0120's "warns, never blocks" product-owner decision into a blocking gate.
   *
   * Verified red by deleting the R3a loop: the fixture below then returns 0.
   */
  const root = tree({
    'package.json': pkg('check:a', 'check:warns'),
    '.github/workflows/ci.yml': workflow(step('check:a') + step('check:warns')),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
    'scripts/prepush.sh': prepush('check:warns'),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('R3a — and the same advisory gate NOT in CI passes with no exemption at all', () => {
  // The counter-case, without which R3a could be satisfied by refusing every advisory gate. The
  // advisory declaration IS the reason; requiring a second one in `ci-roster.json` would be the
  // two-answers-for-one-fact shape #244 exists to remove.
  const root = tree({
    'package.json': pkg('check:a', 'check:warns'),
    '.github/workflows/ci.yml': workflow(step('check:a')),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
    'scripts/prepush.sh': prepush('check:warns'),
  });
  assert.equal(run(root), 0);
  rmSync(root, { recursive: true, force: true });
});

it('R4a — an advisory gate that ALSO carries a roster reason FAILS', () => {
  // Two reasons for one absence are two places to update, and the day they disagree a reader
  // cannot tell which is current. Verified red by deleting the R4a loop.
  const root = tree({
    'package.json': pkg('check:a', 'check:warns'),
    '.github/workflows/ci.yml': workflow(step('check:a')),
    'scripts/ci-roster.json': JSON.stringify({
      exempt: { 'check:warns': 'Advisory; it warns in prepush and never blocks.' },
    }),
    'scripts/prepush.sh': prepush('check:warns'),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('an unreadable ADVISORY_GATES is REFUSED, never read as an empty set', () => {
  /**
   * Every advisory assertion is over that set, so an empty one passes them all vacuously — the
   * ADR-0093 shape, and the reason `parseAdvisoryGates` throws rather than returning `new Set()`.
   * Two ways to have nothing: no array, and an array that parses to nothing.
   */
  for (const body of [
    '#!/usr/bin/env bash\necho hello\n',
    '#!/usr/bin/env bash\nADVISORY_GATES=()\n',
  ]) {
    const root = tree({
      'package.json': pkg('check:a'),
      '.github/workflows/ci.yml': workflow(step('check:a')),
      'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
      'scripts/prepush.sh': body,
    });
    assert.equal(run(root), 1, `an unreadable advisory declaration must be refused: ${body}`);
    rmSync(root, { recursive: true, force: true });
  }
});

it('R2 — CI running a gate that no longer exists FAILS', () => {
  // Verified red by deleting the R2 loop. A renamed gate leaves a step that fails for a reason
  // nobody expects, on a PR that changed something else.
  const root = tree({
    'package.json': pkg('check:a'),
    '.github/workflows/ci.yml': workflow(step('check:a') + step('check:gone')),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('R3 — an exemption for a gate that does not exist FAILS', () => {
  const root = tree({
    'package.json': pkg('check:a'),
    '.github/workflows/ci.yml': workflow(step('check:a')),
    'scripts/ci-roster.json': JSON.stringify({ exempt: { 'check:gone': 'A reason, once.' } }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('R4 — a gate both exempt and present in CI FAILS', () => {
  // The two files contradict each other, and neither is obviously wrong on its own.
  const root = tree({
    'package.json': pkg('check:a'),
    '.github/workflows/ci.yml': workflow(step('check:a')),
    'scripts/ci-roster.json': JSON.stringify({ exempt: { 'check:a': 'Deliberately not in CI.' } }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

// ------------------------------------------------- workspace gates, resolved where they live

it('R2 — a WORKSPACE gate in CI is resolved against its own package.json, not the root', () => {
  /**
   * `docs/specs/delivery-gates/` M3 found this gate assuming every `check:*` in `ci.yml` is a root
   * script. `check:bundle-size` lives in `apps/web` because it needs a production build, and is
   * invoked as `pnpm --filter @repo/web check:bundle-size` — which R2 reported as a step for a
   * script that does not exist. True of the root manifest, false of the repository.
   *
   * Exempting it would have been the quick answer and the wrong one: the gate would then be blind
   * to a workspace step naming a script that really had been renamed.
   *
   * Verified red by deleting the workspace branch, which restores the false finding.
   */
  const root = tree({
    'package.json': pkg('check:a'),
    'apps/web/package.json': JSON.stringify({
      name: '@repo/web',
      scripts: { 'check:bundle-size': 'node x.mjs' },
    }),
    '.github/workflows/ci.yml': workflow(
      step('check:a') +
        '      - name: budget\n        run: pnpm --filter @repo/web check:bundle-size\n',
    ),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 0);
  rmSync(root, { recursive: true, force: true });
});

it('R2 — a workspace gate naming a script that workspace does not declare FAILS', () => {
  // The teeth the exemption would have removed.
  const root = tree({
    'package.json': pkg('check:a'),
    'apps/web/package.json': JSON.stringify({ name: '@repo/web', scripts: { build: 'vite' } }),
    '.github/workflows/ci.yml': workflow(
      step('check:a') +
        '      - name: budget\n        run: pnpm --filter @repo/web check:bundle-size\n',
    ),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

it('R2 — a workspace that does not exist FAILS', () => {
  const root = tree({
    'package.json': pkg('check:a'),
    '.github/workflows/ci.yml': workflow(
      step('check:a') +
        '      - name: budget\n        run: pnpm --filter @repo/nope check:bundle-size\n',
    ),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- the two that carry the gate

it('R6 — a gate named only in a COMMENT is not covered', () => {
  /**
   * **The live trap, on the live script.** `#244`'s own recommended remedy was a grep of `ci.yml`
   * for each gate's name. Run against this repository today it reports `check:reconcile-due` as
   * covered — and that gate's ONLY occurrence in the whole file is a comment saying it is
   * *deliberately absent*. The naive check passes over the single genuine absence in the roster,
   * by reading the sentence that documents it.
   *
   * Both comment forms are here because both occur: a YAML comment at the step level, and a shell
   * comment inside a `run:` block. A YAML parser would have caught the first and handed back the
   * second inside the run string — which is why this gate strips text rather than parsing.
   *
   * Verified red by removing the comment-stripping replace.
   */
  const root = tree({
    'package.json': pkg('check:a', 'check:b'),
    '.github/workflows/ci.yml': workflow(
      '      # Deliberately absent from this list: `check:a`, which is advisory.\n' +
        '      - name: something\n' +
        '        run: |\n' +
        '          # pnpm check:b would go here\n' +
        '          echo hello\n',
    ),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 1, 'a comment must not satisfy the roster');
  rmSync(root, { recursive: true, force: true });
});

it('R7 — an empty roster BLOCKS rather than passing over nothing', () => {
  // ADR-0093. Every loop above is satisfied perfectly by a roster of zero gates, and a green run
  // could not then tell "every gate is wired" from "there are no gates". Verified red by passing
  // `population: declared.length || 1`.
  const root = tree({
    'package.json': JSON.stringify({ scripts: { build: 'turbo build' } }),
    '.github/workflows/ci.yml': workflow('      - name: nothing\n        run: echo\n'),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.notEqual(run(root), 0, 'an empty population must not report green');
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- the gate's own two traps

it('R5 — the gate does not restate the roster it derives', () => {
  /**
   * A gate that hard-codes the names it checks recreates the duplication it exists to remove: the
   * list would then have to be maintained in three places rather than two. Its own name is the one
   * allowed literal, and comments are stripped first — this repository has recorded **four** gates
   * matching their own prose, and a check about scanning is the worst possible place for a fifth.
   *
   * Verified red by pasting `const KNOWN = ['check:counts']` into the gate.
   */
  const src = readFileSync(new URL(SELF, new URL('..', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const literals = [...src.matchAll(/check:[a-z][a-z0-9-]*/g)].map((m) => m[0]);
  const foreign = literals.filter((n) => n !== 'check:ci-roster');
  assert.deepEqual(foreign, [], `the gate names other gates literally: ${foreign.join(', ')}`);
});

it('R8 — a # inside a quoted string makes the gate REFUSE, not guess', () => {
  /**
   * The residual risk of stripping rather than parsing, made loud. There is no such string in
   * `ci.yml` today (measured), and a gate that quietly starts reading its subject wrong is the
   * exact failure this file is about — so it stops instead.
   *
   * Verified red by deleting the check: the gate then strips the quoted `#` to end of line, loses
   * the `run:` on that line, and reports the gate as unwired — a true-looking finding with a false
   * cause, which is worse than the refusal.
   */
  const root = tree({
    'package.json': pkg('check:a'),
    '.github/workflows/ci.yml': workflow(
      '      - name: "a step # with a hash"\n        run: pnpm check:a\n',
    ),
    'scripts/ci-roster.json': JSON.stringify({ exempt: {} }),
  });
  assert.equal(run(root), 1);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- the pinned positive

it('the real repository passes — the pinned positive case', () => {
  // Without this, every assertion above is satisfied by a gate that fails on everything.
  assert.equal(run(new URL('..', import.meta.url).pathname), 0);
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
  `check:ci-roster tests: ${failures === 0 ? 'OK' : 'FAIL'} — ${cases.length - failures}/${cases.length} passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
