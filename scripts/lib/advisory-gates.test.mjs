/**
 * **`parseAdvisoryGates`, and the two hardenings that record having shipped wrong.**
 *
 * This parse lived inside `check-advisory-agreement.mjs` behind two comments saying, in effect,
 * "this was broken once, here is how" — and **nothing tested either of them**.
 * `docs/specs/delivery-gates/` M5 extracted it so `check:ci-roster` could read the same answer
 * rather than restating it, which made an untested parser load-bearing for two gates instead of one.
 *
 * The mutation sweep is what noticed: deleting the comment-strip and narrowing to double quotes
 * both left the roster suite **green**. So these cases exist, and each names the mutation it was
 * verified red against.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAdvisoryGates } from './advisory-gates.mjs';

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

it('reads the declared names', () => {
  assert.deepEqual(
    [...parseAdvisoryGates('ADVISORY_GATES=("check:a" "check:b")\n')],
    ['check:a', 'check:b'],
  );
});

it('accepts BOTH quote styles', () => {
  /**
   * Verified red by narrowing the pattern to `/"([^"]+)"/g`, which is what it once was. Rewriting
   * the array with single quotes changes nothing in bash, so the edit reads as a tidy-up — and it
   * produced an EMPTY declared set, after which the gate accused a correctly-declared gate of
   * being unlisted. Found by the ADR-0124 devops review; pinned here for the first time.
   */
  assert.deepEqual([...parseAdvisoryGates("ADVISORY_GATES=('check:a')\n")], ['check:a']);
  assert.deepEqual(
    [...parseAdvisoryGates('ADVISORY_GATES=(\'check:a\' "check:b")\n')],
    ['check:a', 'check:b'],
  );
});

it('strips comments BEFORE matching, so a ) inside one cannot truncate the array', () => {
  /**
   * Verified red by dropping the comment-stripping `.replace(...)`. The capture then ends at the
   * first `)` — the one inside the comment — and every gate named on a later line vanishes,
   * which is the worse direction: fewer advisory gates means the assertions over them pass.
   */
  const source = [
    'ADVISORY_GATES=(',
    '  # the remedy is a pass (see docs/RECONCILE.md), not an edit',
    '  "check:a"',
    '  "check:b"',
    ')',
    '',
  ].join('\n');
  assert.deepEqual([...parseAdvisoryGates(source)], ['check:a', 'check:b']);
});

it('a comment must not contribute a NAME either', () => {
  // The other direction: a commented-out entry is not a declaration. Without the strip, the quoted
  // text inside the comment matches like any other and the gate believes a decision nobody made.
  assert.deepEqual(
    [...parseAdvisoryGates('ADVISORY_GATES=(\n  # "check:removed"\n  "check:a"\n)\n')],
    ['check:a'],
  );
});

it('THROWS when the array is absent — never an empty set', () => {
  // An empty set satisfies every assertion over it (ADR-0093), so both ways of having nothing must
  // be loud. Verified red by returning `new Set()` instead of throwing.
  assert.throws(() => parseAdvisoryGates('#!/usr/bin/env bash\necho hello\n'), /no ADVISORY_GATES/);
});

it('THROWS when the array is present but parses to nothing', () => {
  assert.throws(() => parseAdvisoryGates('ADVISORY_GATES=()\n'), /EMPTY list/);
  assert.throws(() => parseAdvisoryGates('ADVISORY_GATES=(\n  # all removed\n)\n'), /EMPTY list/);
});

it('the REAL prepush.sh parses — the pinned positive case', () => {
  /**
   * ADR-0093. Every case above is a fixture, and a parser that returned nothing for the real file
   * would satisfy the two `throws` cases and fail none of the others. This is the one that says it
   * works on the artefact it exists for.
   */
  const source = readFileSync(new URL('../prepush.sh', import.meta.url), 'utf8');
  const gates = parseAdvisoryGates(source);
  assert.ok(gates.size > 0, 'the real prepush.sh declares at least one advisory gate');
  for (const g of gates) assert.match(g, /^check:[a-z][a-z0-9-]*$/, `${g} is a gate name`);
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
  `advisory-gates tests: ${failures === 0 ? 'OK' : 'FAIL'} — ${cases.length - failures}/${cases.length} passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
