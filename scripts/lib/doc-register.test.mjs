// @ts-check
/**
 * Fixtures for `doc-register.mjs` — **the only safety net both gates have.**
 *
 * Neither `check:debt-status` nor `check:reconcile-due` has a journey, a browser or a real user
 * behind it; if this module silently drops half a document, both gates report green over less than
 * they think and nothing anywhere says so. So every case below pins a defect this repository has
 * really shipped, and each says which one.
 *
 * Run standalone: `node scripts/lib/doc-register.test.mjs`
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  fieldValue,
  readRepoDoc,
  report,
  sections,
  stripFences,
  tableRows,
} from './doc-register.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const traps = readRepoDoc(join(here, 'fixtures/traps.md'));
const unterminated = readRepoDoc(join(here, 'fixtures/unterminated.md'));

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

// ── stripFences ────────────────────────────────────────────────────────────────────────────────
it('strips ``` fences but preserves line numbering', () => {
  const stripped = stripFences(traps);
  assert.equal(stripped.split('\n').length, traps.split('\n').length, 'line count must not change');
  assert.ok(!stripped.includes('## Not a row'));
});

it('strips ~~~ fences and fences longer than three characters', () => {
  const stripped = stripFences(traps);
  assert.ok(!stripped.includes('## Also not a row'), '~~~ fence');
  assert.ok(!stripped.includes('## Still not a row'), '```` fence');
});

it('an unterminated fence swallows the rest, as a renderer would', () => {
  const stripped = stripFences(unterminated);
  assert.ok(stripped.includes('## Before the fence'));
  assert.ok(!stripped.includes('## Inside an unterminated fence'));
});

// ── sections ───────────────────────────────────────────────────────────────────────────────────
it('counts only real headings, and never one inside a fence', () => {
  const found = sections(traps, 2).map((s) => s.heading);
  assert.equal(found.length, 6, `expected 6 rows, got ${found.length}: ${found.join(' | ')}`);
  assert.ok(!found.some((h) => h.includes('Not a row')));
});

it('reports 1-based line numbers a reader can cite', () => {
  const first = sections(traps, 2)[0];
  assert.equal(traps.split('\n')[first.line - 1], `## ${first.heading}`);
});

// ── fieldValue — the six-instance prose trap ───────────────────────────────────────────────────
it('reads a status declared at column 0', () => {
  const row = sections(traps, 2).find((s) => s.heading.startsWith('Row one'));
  assert.equal(fieldValue(row.body, 'Status'), 'open');
});

it('does NOT read a status a row merely DISCUSSES (the live #219 defect)', () => {
  const row = sections(traps, 2).find((s) => s.heading.startsWith('Row two'));
  assert.equal(fieldValue(row.body, 'Status'), null);
});

it('does NOT read an indented status — a declaration is at column 0', () => {
  const row = sections(traps, 2).find((s) => s.heading.startsWith('Row three'));
  assert.equal(fieldValue(row.body, 'Status'), null);
});

// ── tableRows — cells by index, never by text ──────────────────────────────────────────────────
it('reads table cells by index, so a date in a prose column is not a date column', () => {
  const rows = tableRows(traps, 'Row six');
  assert.equal(rows.length, 3, 'header + two data rows, separator dropped');
  assert.deepEqual(rows[1][0], '2026-08-25');
  assert.ok(rows[1][1].includes('2026-08-30'), 'the prose column keeps its own date');
});

// ── report — the exit convention, all three codes plus the empty-population refusal ────────────
const quiet = (fn) => {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return fn();
  } finally {
    process.stdout.write = write;
  }
};

it('exit 0 clean, 1 blocking, 2 advisory', () => {
  assert.equal(
    quiet(() => report({ name: 't', population: 5 })),
    0,
  );
  assert.equal(
    quiet(() => report({ name: 't', population: 5, problems: ['x'] })),
    1,
  );
  assert.equal(
    quiet(() => report({ name: 't', population: 5, warnings: ['x'] })),
    2,
  );
});

it('blocking outranks advisory when both are present', () => {
  assert.equal(
    quiet(() => report({ name: 't', population: 5, problems: ['x'], warnings: ['y'] })),
    1,
  );
});

it('REFUSES to report success over an empty population', () => {
  // ADR-0108's census passed because its glob matched zero files; ADR-0093 records a suite that
  // could not tell "the duplicate is gone" from "the capability is gone". Zero is a finding.
  assert.equal(
    quiet(() => report({ name: 't', population: 0 })),
    1,
  );
});

process.stdout.write(
  process.exitCode === 1
    ? `doc-register: FAILED (${run} cases)\n`
    : `doc-register: ${run} cases OK\n`,
);
