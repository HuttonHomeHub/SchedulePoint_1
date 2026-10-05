// @ts-check
/**
 * Fixtures for `check-debt-status.mjs` — **and every A11 case names the mutation that made it red.**
 *
 * Until 2026-10-05 this was a register gate with no `.test.mjs` sibling (the drift-gates spec had
 * promised one), so none of its assertions had ever been made to fail by a fixture. A11, the
 * completeness assertion added with this file, is the one this suite exists for: every number from
 * 1 to the highest in use is a live row or a ledger line. ADR-0110 D5 sets the standard — *a gate
 * is finished when it has been made to fail by the defect it was written for* — so each `it()`
 * carries, in its own comment, the edit to `check-debt-status.mjs` that turns it red.
 *
 * **The suite drives `runGate(root)`, which is what the CLI calls**, `report()` included, over a
 * throwaway tree holding `docs/TECH_DEBT.md` and `scripts/debt-register.json` — not a private
 * mirror of the rules.
 *
 * A1–A10 are exercised only through the pinned positive case and the real register: this file
 * does not claim to have verified them red.
 *
 * Run standalone: `node scripts/check-debt-status.test.mjs`
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runGate } from './check-debt-status.mjs';
import { REPO_ROOT } from './lib/doc-register.mjs';

const detailedRow = (n) =>
  `### ${n}. Row ${n}\n\n**Status:** open · **Verified:** 2026-10-05\n\nBody of ${n}.\n`;
const ledgerLine = (n) => `| ${n} | What ${n} was | 2026-01-01 | Recorded. |`;

/**
 * Build a throwaway register. Numbers are passed per region: `compact` rows sit above
 * `## Detailed items`, `detailed` are `###` rows, `ledger` are lines in the Closed-numbers table.
 * `afterLedger` is raw text placed after the ledger table, where the real register keeps detailed
 * rows that continue past it. `ledgerHeading: false` withholds the `## Closed numbers` heading.
 *
 * **The compact ratchet is set to the fixture's own count**, because A7 refuses a stale one and a
 * case built for A11 would otherwise go red for an unrelated reason and pass without discriminating
 * (ADR-0131 records a control making twelve unrelated fixtures fail).
 */
function tree({
  compact = [1],
  detailed = [2, 3],
  ledger = [4, 5],
  afterLedger = '',
  ledgerHeading = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'debt-status-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  const md = [
    '# Technical debt register',
    '',
    '## Principles for managing debt',
    '',
    'Prose.',
    '',
    '| # | Item |',
    '| --- | --- |',
    ...compact.map((n) => `| ${n} | Compact row ${n} |`),
    '',
    '## Detailed items',
    '',
    ...detailed.map(detailedRow),
    ledgerHeading ? '## Closed numbers' : '## Something else',
    '',
    '| # | What it was | Closed | Where the record is |',
    '| --- | --- | --- | --- |',
    ...ledger.map(ledgerLine),
    '',
    afterLedger,
  ].join('\n');
  writeFileSync(join(root, 'docs/TECH_DEBT.md'), md);
  writeFileSync(
    join(root, 'scripts/debt-register.json'),
    JSON.stringify({ compactTableRatchet: compact.length }),
  );
  return root;
}

/** Run the gate silently and return `{ code, problems, summary }`. */
function gate(root) {
  const original = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — deliberately silencing the gate's own output for the duration of one run.
  process.stdout.write = () => true;
  try {
    return runGate(root);
  } finally {
    process.stdout.write = original;
  }
}

const tag = (p) => p.split(':')[0];
const a11 = (r) => r.problems.filter((p) => tag(p) === 'A11');

let run = 0;
const roots = [];
const it = (what, fn) => {
  run += 1;
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  ✗ ${what}\n    ${err.message}\n`);
    process.exitCode = 1;
  }
};
const make = (opts) => {
  const root = tree(opts);
  roots.push(root);
  return root;
};

it('a register whose numbers are all live or ledgered PASSES, and so does the real one', () => {
  // **The pinned positive case (ADR-0093).** Without it every refusal below passes equally against
  // a gate that fails every register it sees. 1 is compact, 2-3 detailed, 4-5 ledgered.
  const ok = gate(make());
  assert.equal(ok.code, 0, `expected a pass, got: ${ok.problems.join(' | ')}`);
  assert.match(ok.summary, /Numbers 1–5: all accounted for/);

  // The real register: the case that would have been a flood of false A11 findings had the parse
  // been wrong, so it is pinned here rather than left to the CLI run alone.
  const real = gate(REPO_ROOT);
  assert.equal(real.code, 0, `the real register must pass: ${real.problems.join(' | ')}`);
  assert.match(real.summary, /Numbers 1–\d+: all accounted for/);
});

it('a deleted detailed row is named by A11', () => {
  // Mutation: delete the `for (let n = 1; n <= highest; …)` loop, or its `problems.push`.
  const r = gate(make({ detailed: [2] }));
  assert.equal(r.code, 1);
  assert.equal(a11(r).length, 1);
  assert.match(a11(r)[0], /^A11: #3 /);
});

it('a deleted ledger line is named by A11', () => {
  // Mutation: change `liveSet.has(n) || ledgeredSet.has(n)` to `liveSet.has(n) || true`, so a number
  // is accepted whether or not the ledger holds it. Verified red.
  const r = gate(make({ ledger: [5] }));
  assert.equal(r.code, 1);
  assert.equal(a11(r).length, 1);
  assert.match(a11(r)[0], /^A11: #4 /);
});

it('a deleted compact-table row is named by A11', () => {
  // Mutation: build `liveSet` from `items` alone (`[...items]`), leaving the compact rows out.
  // Compact rows are live rows, and with them left out every compact number reads as missing.
  const r = gate(make({ compact: [1, 2], detailed: [3], ledger: [4, 5] }));
  assert.equal(r.code, 0, `1 and 2 are both compact: ${r.problems.join(' | ')}`);
  const gone = gate(make({ compact: [2], detailed: [3], ledger: [4, 5] }));
  assert.equal(gone.code, 1);
  assert.match(a11(gone)[0], /^A11: #1 /);
});

it('a ledger-shaped line inside a later detailed row does NOT satisfy A11', () => {
  // The #343/#360/#362 shape: three ledger lines sat in `### 294.`'s measurement table, after the
  // ledger, and counted as ledgered. 5 is only "ledgered" by a stray line here; 6 sets the ceiling.
  // Mutation: restore the unscoped parse — `for (let i = ledgerAt; …)` without the `break` once the
  // table has ended — and this case goes green-when-it-should-be-red.
  const stray = `${detailedRow(6)}\n| # | Item | Closed |\n| --- | --- | --- |\n${ledgerLine(5)}\n`;
  const r = gate(make({ ledger: [4], afterLedger: stray }));
  assert.equal(r.code, 1);
  assert.equal(a11(r).length, 1);
  assert.match(a11(r)[0], /^A11: #5 /);
});

it('a suffixed row neither satisfies nor demands its integer', () => {
  // `118a` is a sub-item. Mutation: strip the suffix in `wholeNumber` (e.g. parseInt) — then 3a
  // would satisfy 3 in the first half, and 7a would raise the ceiling and demand 6 and 7 in the
  // second.
  const lacks = gate(make({ detailed: [2, '3a'] }));
  assert.equal(lacks.code, 1);
  assert.match(a11(lacks)[0], /^A11: #3 /);

  const extra = gate(make({ detailed: [2, 3, '7a'] }));
  assert.equal(extra.code, 0, `7a must not demand 6 or 7: ${extra.problems.join(' | ')}`);
});

it('an empty ledger gives exactly one A9 finding and no A11 findings', () => {
  // One cause, one finding — not a finding per number the parse failed to find. Mutation: delete
  // the `ledger.length === 0` branch, and 4 and 5 are reported as A11 and the A9 is gone.
  const empty = gate(make({ ledger: [] }));
  assert.equal(empty.code, 1);
  assert.deepEqual(empty.problems.map(tag), ['A9']);

  // A missing heading is the same refusal, and names its anchor.
  const noHeading = gate(make({ ledgerHeading: false }));
  assert.deepEqual(noHeading.problems.map(tag), ['A9']);
  assert.match(noHeading.problems[0], /## Closed numbers/);
});

it('deleting the HIGHEST number is not reported — a known blind spot, pinned', () => {
  // `highest` is read from the file, so removing the top row lowers the ceiling. **This test should
  // flip the day a high-water mark is added** (spec Q-2), and that is its purpose: the limitation
  // changes visibly rather than silently. Mutation: none — it documents what the gate does not do.
  const r = gate(make({ ledger: [4] }));
  assert.equal(r.code, 0, `5 was the highest and is not demanded: ${r.problems.join(' | ')}`);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

process.stdout.write(
  process.exitCode === 1
    ? `check-debt-status: FAILED (${run} cases)\n`
    : `check-debt-status: ${run} cases OK\n`,
);
