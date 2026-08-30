// @ts-check
/**
 * Fixtures for `check-reconcile-due.mjs`'s **three-site comparison** (spec US-6 / S8).
 *
 * `docs/RECONCILE.md` tells the owner of a pass to record it in three places "all three, in the same
 * commit". That instruction is prose, and prose is what failed: the banner said `2026-07-28` while
 * the table recorded `2026-07-31`. **The live repository is now consistent, which is exactly why
 * these fixtures exist** — a gate is not finished when it passes, it is finished when it has been
 * made to fail by the defect it was written for (ADR-0110 D5), and there is no longer a red case in
 * the repository to point it at.
 *
 * Run standalone: `node scripts/check-reconcile-due.test.mjs`
 */

import assert from 'node:assert/strict';

import { maxDate, passSites } from './check-reconcile-due.mjs';

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

const reconcile = (banner, tableDates) => `# Runbook

> **Last full pass: ${banner}.** Record each pass in DECISIONS.md.

## Passes run

| Date | Scope | Findings |
| ---- | ----- | -------- |
${tableDates.map((d) => `| ${d} | full | A ${d === '2026-01-01' ? '2026-12-31' : '2026-12-30'} date in the prose column. |`).join('\n')}
`;

const decisionsDoc = (dates) =>
  `# Decisions\n\n${dates.map((d) => `## ${d} — Something\n\nBody.\n`).join('\n')}`;

it('reads the banner from its own line, not from any date in the prose', () => {
  const sites = passSites(reconcile('2026-08-28', ['2026-08-30']), decisionsDoc([]));
  assert.equal(sites.banner, '2026-08-28');
  assert.equal(sites.table, '2026-08-30');
});

it('the table date comes from column 1, never from the prose column', () => {
  // The findings column here holds 2026-12-30, later than any real pass. Reading a row's text and
  // taking the first date is how a reader concluded the last pass was five days earlier than it was.
  const sites = passSites(reconcile('2026-08-30', ['2026-08-25', '2026-08-30']), decisionsDoc([]));
  assert.equal(sites.table, '2026-08-30');
});

it('the table maximum is taken over every row, because the table is not sorted', () => {
  // The unsorted table IS the defect this gate exists because of: `tail -8` on it produced a wrong
  // answer during an audit whose subject was staleness.
  const sites = passSites(reconcile('2026-08-30', ['2026-08-30', '2026-08-20']), decisionsDoc([]));
  assert.equal(sites.table, '2026-08-30');
});

it('reads DECISIONS.md headings at both levels', () => {
  const doc = '# Decisions\n\n## 2026-08-30 — Two\n\nBody.\n\n### 2026-08-20 — Three\n\nBody.\n';
  const sites = passSites(reconcile('2026-08-30', ['2026-08-30']), doc);
  assert.deepEqual(sites.decisions, ['2026-08-20', '2026-08-30']);
});

it('the effective date is the NEWEST site, so a stale banner cannot invent overdue work', () => {
  assert.equal(maxDate(['2026-08-28', '2026-08-30']), '2026-08-30');
  assert.equal(maxDate([null, '2026-08-30']), '2026-08-30');
  assert.equal(maxDate([null, undefined]), null);
});

process.stdout.write(
  failed > 0
    ? `check-reconcile-due: FAILED (${run} cases)\n`
    : `check-reconcile-due: ${run} cases OK\n`,
);
