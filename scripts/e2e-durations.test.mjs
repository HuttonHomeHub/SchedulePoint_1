// @ts-check
/**
 * Guards `scripts/e2e-durations.json` — the per-suite timings the shard assignment in
 * `.github/workflows/ci.yml` is derived from (`docs/specs/ci-sharding/`, Milestone 0).
 *
 * **The load-bearing assertion is the one about coverage, not the one about parsing.** A durations
 * file that is merely valid JSON will still mis-size a shard if a suite is missing from it, and the
 * failure is quiet: `check:e2e-roster` charges an unrecorded suite the largest recorded duration,
 * so a missing entry inflates a projection rather than crashing it. Set equality against
 * `package.json` — in **both** directions — is what turns that into a red test instead of a wrong
 * number nobody reads.
 *
 * **What this file deliberately does NOT assert: any wall-clock time.** Not a total, not a per-suite
 * bound, not a ratio between two suites. `docs/specs/ci-sharding/feature-spec.md` §1.4 forbids it
 * across the whole epic, on measurement rather than on principle: five samples of the same CI job
 * span 40–47 minutes (14.9 %), and the two slowest changed no test and no workflow at all. A gate
 * asserting a duration here would fail on a slow runner and be deleted rather than fixed, which is
 * ADR-0058's rule. The numbers are ratios that happen to carry units.
 *
 * The one number that IS checked is a **consistency** check and not a timing one: the recorded web
 * durations must sum to the total the file claims they sum to. That catches a hand-edited entry,
 * and it compares the file against itself rather than against a runner.
 *
 * Run standalone: `node scripts/e2e-durations.test.mjs`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), 'utf8'));

/** Every `test:e2e` / `test:e2e:*` script a workspace declares. */
const declared = (relative) =>
  Object.keys(readJson(relative).scripts ?? {})
    .filter((name) => name === 'test:e2e' || name.startsWith('test:e2e:'))
    .sort();

const durations = readJson('scripts/e2e-durations.json');

it('parses, and carries the run it describes plus the date it was taken', () => {
  // Without both, a projection printed from this file cannot state its own age — which is the whole
  // mitigation for the durations going stale (spec §4.5).
  assert.match(durations.run, /^\d+$/, 'run id must be a numeric GitHub run id');
  assert.match(durations.job, /^\d+$/, 'job id must be a numeric GitHub job id');
  assert.match(durations.measured, /^\d{4}-\d{2}-\d{2}$/, 'measured must be an ISO date');
});

it('says what it is NOT, because the tempting misuse is to assert against it', () => {
  assert.ok(
    durations._.includes('WHAT THIS IS NOT'),
    'the file must state that no gate asserts against it',
  );
});

it('covers every declared web suite, and declares no suite that does not exist', () => {
  // Both directions. One direction alone passes against a file listing a deleted suite, and the
  // other passes against a file that has quietly lost one.
  const measured = Object.keys(durations.seconds.web).sort();
  assert.deepEqual(measured, declared('apps/web/package.json'));
});

it('covers every declared API end-to-end script, on the same rule', () => {
  const measured = Object.keys(durations.seconds.api).sort();
  assert.deepEqual(measured, declared('apps/api/package.json'));
});

it('is keyed by script name, so it cannot drift from the roster it sizes', () => {
  // A CI step's title is prose and gets reworded; the script it runs is the key `check:e2e-roster`
  // derives its own roster from. Keying on the title is the "matching on step titles rather than
  // the commands they run" risk the plan names for the gate, one file upstream.
  for (const key of Object.keys(durations.seconds.web)) {
    assert.ok(
      key === 'test:e2e' || key.startsWith('test:e2e:'),
      `web key ${key} is not a package.json script name`,
    );
  }
});

it('records a positive duration for every suite, never a zero', () => {
  // A zero would let a suite ride free in a packing and is the ADR-0093 shape: a gate that cannot
  // tell "measured as instant" from "not measured at all".
  for (const [key, seconds] of Object.entries({
    ...durations.seconds.web,
    ...durations.seconds.api,
  })) {
    assert.ok(
      Number.isInteger(seconds) && seconds > 0,
      `${key} must carry a positive integer duration, got ${seconds}`,
    );
  }
});

it('the web durations sum to the total the file claims, so a hand-edit cannot pass unnoticed', () => {
  // A consistency check against the file's own prose, NOT a timing assertion: it compares the file
  // with itself and never with a runner, so no slow machine can turn it red.
  const claimed = Number(durations.residualCheck.match(/sum to (\d+) s/)?.[1]);
  const actual = Object.values(durations.seconds.web).reduce((a, b) => a + b, 0);
  assert.equal(actual, claimed);
});

process.stdout.write(
  failed > 0 ? `e2e-durations: FAILED (${run} cases)\n` : `e2e-durations: ${run} cases OK\n`,
);
