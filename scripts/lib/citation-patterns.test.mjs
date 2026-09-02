// @ts-check
/**
 * **The extension class is ONE list, and this asserts the derivation rather than the values**
 * (`docs/TECH_DEBT.md` #240).
 *
 * The defect that produced this module was two hand-written copies of `\.m?js` — and a third,
 * disagreeing, spelling in the own-file exclusion (`git ls-files '*.js' '*.mjs' '*.cjs'`). Every
 * assertion below is therefore about *where a value comes from*, not what it happens to be: a test
 * that pinned the five extensions would pass just as happily against three hard-coded copies of
 * them, which is the state this replaced.
 *
 * Measured cost of getting it wrong, from `docs/specs/claims-citation-scan/m0-measurement.md`:
 * widening the patterns while leaving the globs alone produces **87 findings on the first run**,
 * nearly all of them this repository's own stylesheets. That is ADR-0058's gate that fails on day
 * one and gets deleted rather than fixed.
 *
 * Run standalone: `node scripts/lib/citation-patterns.test.mjs`
 */

import assert from 'node:assert/strict';

import {
  CITATIONS,
  CITED_EXTENSIONS,
  EXTENSION_ALTERNATION,
  ownGlobs,
} from './citation-patterns.mjs';

let run = 0;
let failed = 0;
/** @param {string} name @param {() => void} fn */
function test(name, fn) {
  run += 1;
  try {
    fn();
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${String(error instanceof Error ? error.message : error)}`);
  }
}

test('both patterns are built from the shared alternation, not from a literal', () => {
  for (const pattern of CITATIONS) {
    assert.ok(
      pattern.source.includes(EXTENSION_ALTERNATION),
      'a pattern does not carry the shared alternation — it has been hand-written again',
    );
  }
});

test('the own-file globs are derived from the same list', () => {
  assert.deepEqual(
    ownGlobs(),
    CITED_EXTENSIONS.map((ext) => `*.${ext}`),
  );
  assert.equal(
    ownGlobs().length,
    CITATIONS.length && CITED_EXTENSIONS.length,
    'the glob list and the extension list have diverged',
  );
});

test('a dotted member is escaped, so `d.ts` cannot match `dXts`', () => {
  assert.ok(EXTENSION_ALTERNATION.includes('d\\.ts'), 'd.ts is not escaped in the alternation');
  const [colon] = CITATIONS;
  assert.ok(colon, 'the colon pattern is missing');
  colon.lastIndex = 0;
  assert.equal(new RegExp(colon.source).test('useBlocker.dXts:35'), false);
  assert.equal(new RegExp(colon.source).test('useBlocker.d.ts:35'), true);
});

test('longest-first ordering, so a shorter member cannot shadow a longer one', () => {
  const members = EXTENSION_ALTERNATION.split('|');
  const lengths = members.map((m) => m.length);
  assert.deepEqual(
    lengths,
    [...lengths].sort((a, b) => b - a),
    'the alternation is not longest-first',
  );
});

test('every member of the class is actually matched by the colon pattern', () => {
  const [colon] = CITATIONS;
  assert.ok(colon, 'the colon pattern is missing');
  for (const ext of CITED_EXTENSIONS) {
    assert.ok(
      new RegExp(colon.source).test(`some-file.${ext}:12-14`),
      `the class admits .${ext} but the pattern does not match it`,
    );
  }
});

test('an extension outside the class is still refused', () => {
  const [colon] = CITATIONS;
  assert.ok(colon, 'the colon pattern is missing');
  for (const ext of ['ts', 'tsx', 'json', 'map', 'html']) {
    assert.equal(
      new RegExp(colon.source).test(`some-file.${ext}:12-14`),
      false,
      `.${ext} is excluded by decision (see the class's docblock) but the pattern matches it`,
    );
  }
});

console.log(`citation-patterns: ${run - failed}/${run} passed`);
if (failed > 0) process.exit(1);
