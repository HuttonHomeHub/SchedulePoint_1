// @ts-check
/**
 * Fixtures for `check-licenses.mjs` — **and the most important one is L3.**
 *
 * This gate's steady state is green over a tree that has never contained anything objectionable:
 * the 2026-09-11 measurement found 918 packages, 17 identifiers, no copyleft and nothing unknown.
 * A suite built only from that tree would pass identically against a parser that allows everything.
 * So L3 feeds it a `GPL-3.0` package and requires a refusal — ADR-0093's pinned positive case, in
 * the one shape where its absence would be invisible for years.
 *
 * The tree is injected rather than shelled out to, so every case runs in milliseconds and none of
 * them depends on what happens to be installed. The REAL tree is exercised once, at the end.
 *
 * Run standalone: `node scripts/check-licenses.test.mjs`
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isAllowed, runGate } from './check-licenses.mjs';

const pkg = (name, versions = ['1.0.0']) => ({ name, versions, paths: [], license: 'x' });

/** A policy file on disk, since the gate reads one. */
function policyFile(policy) {
  const dir = mkdtempSync(join(tmpdir(), 'licence-'));
  const path = join(dir, 'licence-policy.json');
  writeFileSync(path, JSON.stringify(policy));
  return { path, dir };
}

const BASE = {
  allow: { MIT: 'Permissive.', ISC: 'Permissive.' },
  exempt: { _: 'explanation' },
};

function run(tree, policy = BASE) {
  const { path, dir } = policyFile(policy);
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return runGate({ readTree: () => tree, policyPath: path });
  } finally {
    process.stdout.write = write;
    rmSync(dir, { recursive: true, force: true });
  }
}

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

it('L1 — a licence not in the allow-list is refused', () => {
  // Verified red by adding the identifier to the fixture policy.
  assert.equal(run({ MIT: [pkg('a')], WTFPL: [pkg('b')] }), 1);
});

it('L2 — a missing or empty licence identifier is refused', () => {
  // Unknown fails. Verified red by treating an unresolvable expression as allowed.
  assert.equal(run({ '': [pkg('a')] }), 1);
  assert.equal(run({ UNKNOWN: [pkg('a')] }), 1);
});

it('L3 — THE PINNED POSITIVE: a GPL-3.0 package is refused', () => {
  /**
   * The real tree has never contained one, so every other assertion here would pass identically
   * against a parser that allows everything. This is the case that makes green mean something.
   */
  assert.equal(run({ MIT: [pkg('fine')], 'GPL-3.0': [pkg('copyleft')] }), 1);
  assert.equal(run({ MIT: [pkg('fine')], 'GPL-3.0-or-later': [pkg('copyleft')] }), 1);
  assert.equal(run({ MIT: [pkg('fine')], 'AGPL-3.0': [pkg('network-copyleft')] }), 1);
});

it('L3b — and an exemption can still admit one, because that is a decision somebody made', () => {
  const policy = {
    ...BASE,
    exempt: { _: 'x', copyleft: 'Read the repo on 2026-09-11; dev-only.' },
  };
  assert.equal(run({ MIT: [pkg('fine')], 'GPL-3.0': [pkg('copyleft')] }, policy), 0);

  // But an exemption with NO reason admits nothing. The policy file says an entry "names who read
  // the package's own repository and when", and a name with an empty string beside it is the
  // shape somebody reaches for when they want the gate quiet rather than when they have checked.
  for (const blank of ['', '   ', '\n']) {
    assert.equal(
      run(
        { MIT: [pkg('fine')], 'GPL-3.0': [pkg('copyleft')] },
        { ...BASE, exempt: { _: 'x', copyleft: blank } },
      ),
      1,
      `an exemption whose reason is ${JSON.stringify(blank)} must not admit the package`,
    );
  }
});

it('L4 — a stale exemption is refused', () => {
  // An exemption for a package no longer in the tree is an exemption nobody is reading.
  const policy = { ...BASE, exempt: { _: 'x', gone: 'Read once, long ago.' } };
  assert.equal(run({ MIT: [pkg('a')] }, policy), 1);
});

it('L5 — unparseable tool output is refused, not read as a clean tree', () => {
  // Verified red by dropping the shape assertion: an array walks to nothing and reports OK.
  assert.equal(run([]), 1);
  assert.equal(run(null), 1);
  assert.equal(run('not json'), 1);
});

it('L6 — an empty population blocks', () => {
  // ADR-0093. Every loop is satisfied perfectly by a tree of zero packages.
  assert.notEqual(run({}), 0);
});

it('L7 — an unknown key in the policy is refused', () => {
  assert.equal(run({ MIT: [pkg('a')] }, { ...BASE, deny: ['GPL-3.0'] }), 1);
});

it('workspace packages are skipped BY NAME, and only `@repo/`', () => {
  /**
   * `@repo/*` are this repository's own, private and unpublished. If one ever became publishable it
   * would need a licence like anything else, and a silent skip is how that would go unnoticed.
   *
   * **Both halves, because the first alone does not discriminate.** Widening the prefix from
   * `@repo/` to `@` leaves the first assertion green — every scoped package would be skipped,
   * including somebody else's — which is a far worse gate and an invisible change. Caught by the
   * mutation sweep, not by reading.
   */
  assert.equal(run({ MIT: [pkg('a')], UNKNOWN: [pkg('@repo/types')] }), 0, 'our own is skipped');
  assert.equal(
    run({ MIT: [pkg('a')], 'GPL-3.0': [pkg('@someone-else/thing')] }),
    1,
    'a scoped package that is NOT ours is checked like anything else',
  );
});

it('SPDX OR takes any allowed disjunct; AND requires all conjuncts', () => {
  assert.equal(run({ '(MIT OR GPL-3.0)': [pkg('a')] }), 0, 'OR with one allowed side passes');
  assert.equal(run({ 'MIT AND GPL-3.0': [pkg('a')] }), 1, 'AND with one disallowed side fails');
  assert.equal(run({ 'MIT AND ISC': [pkg('a')] }), 0, 'AND with both allowed passes');
  // A shape the parser cannot resolve is unknown, and unknown fails — deliberately conservative.
  assert.equal(run({ 'MIT OR (ISC AND GPL-3.0)': [pkg('a')] }), 1);
  assert.equal(run({ 'Apache-2.0 WITH LLVM-exception': [pkg('a')] }), 1);
});

it('isAllowed is conservative about whitespace and casing of the operators', () => {
  const allow = new Set(['MIT', 'ISC']);
  assert.equal(isAllowed('  MIT  ', allow), true);
  assert.equal(isAllowed('(MIT)', allow), true);
  assert.equal(isAllowed('MIT or GPL-3.0', allow), true);
  assert.equal(isAllowed('', allow), false);
  assert.equal(isAllowed(undefined, allow), false);
});

it('the REAL tree passes — the second pinned positive', () => {
  // Without this, every assertion above is satisfied by a gate that refuses everything.
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    assert.equal(runGate(), 0);
  } finally {
    process.stdout.write = write;
  }
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
  `check:licenses tests: ${failures === 0 ? 'OK' : 'FAIL'} — ${cases.length - failures}/${cases.length} passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
