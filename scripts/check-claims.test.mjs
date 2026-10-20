// @ts-check
/**
 * Fixtures for the dead-registration rule of `check-claims.mjs` (`docs/TECH_DEBT.md` #410).
 *
 * The CLI runs at module top level, so the suite drives the pure `deadRegistrations` it calls.
 * That a live entry yields nothing is pinned beside the refusal, so a function that reports every
 * entry (or none) cannot pass both.
 *
 * Run standalone: `node scripts/check-claims.test.mjs`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deadRegistrations } from './lib/citation-patterns.mjs';

let run = 0;
const it = (what, fn) => {
  run += 1;
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  ✗ ${what}\n    ${err.message}\n`);
    process.exitCode = 1;
  }
};

// Built with `join` because the completeness scan walks `scripts/` and would read a literal
// file-and-lines pair in this file as a real, unregistered citation.
const ref = (file, lines) => [file, lines].join(':');
const live = { ref: ref('a.mjs', '1-2'), citedBy: ['docs/x.md'] };
const dead = { ref: ref('b.mjs', '3-4'), citedBy: ['docs/y.md', 'docs/z.md'] };

it('a registration nothing cites is a finding naming the ref, its citedBy and both remedies', () => {
  const found = deadRegistrations([live, dead], new Set([live.ref]));
  assert.equal(found.length, 1);
  assert.ok(found[0].startsWith(`${dead.ref}: `));
  assert.match(found[0], /docs\/y\.md, docs\/z\.md/);
  assert.match(found[0], /Delete the entry/);
  assert.match(found[0], /restore the\s+citation/);
});

it('a cited registration is not a finding', () => {
  assert.deepEqual(deadRegistrations([live], new Set([live.ref])), []);
});

it('an empty citation walk reads every entry dead — no vacuous pass', () => {
  assert.equal(deadRegistrations([live, dead], new Set()).length, 2);
});

it('the CLI turns each dead registration into a problem, not a warning', () => {
  // The wiring is what #410 was: the old loop called console.warn and never touched `problems`.
  const src = readFileSync(new URL('./check-claims.mjs', import.meta.url), 'utf8');
  assert.match(src, /problems\.push\(\.\.\.deadRegistrations\(register\.claims, found\)\)/);
  assert.ok(!/no longer cited anywhere/.test(src), 'the exit-0 note must be gone');
});

process.stdout.write(
  process.exitCode === 1
    ? `check-claims: FAILED (${run} cases)\n`
    : `check-claims: ${run} cases OK\n`,
);
