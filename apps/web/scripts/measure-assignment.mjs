#!/usr/bin/env node
/**
 * **M-C4 — do any of the three assignment rules earn their place?** (FC-C2)
 *
 *   node scripts/measure-assignment.mjs
 *
 * FC-C2: a candidate must reduce **whole-plan crossings per link by ≥ 50 %** against the shipped
 * layout to be OFFERED at all. Below 20 % the withdrawal clause fires and M-C4 does not ship.
 * Between the two, `part-c-conditions.md`'s flag says the decision goes to the product owner with
 * the number in front of them.
 *
 * Measured **whole-plan**, because a framing that culls hands the win to whichever layout shows
 * less of the plan at a time and these candidates differ in height by design (M-C0-T2b's recorded
 * error, corrected once).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const FLOOR = 0.5;
const WITHDRAW_BELOW = 0.2;

const out = mkdtempSync(join(tmpdir(), 'sp-assign-'));
const bundle = join(out, 'probe.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/crossing-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { assignmentCandidates, readWholePlan } = await import(pathToFileURL(bundle).href);

const { asap, shipped, candidates } = assignmentCandidates(FIXTURE);
const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[diagram-legibility Part C M-C4 / FC-C2] node, ${new Date().toISOString()}`);
console.log(`  commit ${commit}`);
console.log(`  floor  a candidate must halve whole-plan crossings per link to be OFFERED\n`);

const baseline = readWholePlan(asap, shipped);
const rows = [{ name: 'shipped (packed + hint)', lanes: shipped.lanes, ...baseline }];
for (const candidate of candidates) {
  rows.push({
    name: candidate.name,
    lanes: candidate.lanes,
    ...readWholePlan(asap, {
      name: candidate.name,
      laneOf: candidate.laneOf,
      lanes: candidate.lanes,
    }),
  });
}

// The control FIRST: every reading must carry the same link population, or the comparison is not
// like-for-like and the numbers below mean nothing (ADR-0130).
const links = rows[0].visibleLinks;
for (const row of rows) {
  if (row.visibleLinks !== links) {
    throw new Error(
      `M-C4 INDETERMINATE: "${row.name}" carries ${row.visibleLinks} links against the baseline's ` +
        `${links}. The framing is culling one of them. Refusing to judge.`,
    );
  }
}
console.log(`  CONTROL PASSES — every layout carries the same ${links} links.\n`);

console.log(
  `    ${'assignment'.padEnd(26)} ${'rows'.padStart(5)} ${'crossings'.padStart(10)} ` +
    `${'per link'.padStart(9)} ${'vs shipped'.padStart(11)}`,
);
for (const row of rows) {
  const delta = (row.perLink - rows[0].perLink) / rows[0].perLink;
  console.log(
    `    ${row.name.padEnd(26)} ${String(row.lanes).padStart(5)} ` +
      `${String(row.crossings).padStart(10)} ${row.perLink.toFixed(3).padStart(9)} ` +
      `${(row === rows[0] ? '—' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`).padStart(11)}`,
  );
}

const best = rows.slice(1).reduce((a, b) => (a.perLink <= b.perLink ? a : b));
const reduction = (rows[0].perLink - best.perLink) / rows[0].perLink;
console.log(`\n  BEST: ${best.name} at ${(reduction * 100).toFixed(1)}% fewer crossings per link,`);
console.log(
  `        in ${String(best.lanes)} rows against the shipped ${String(rows[0].lanes)}.\n`,
);

if (reduction >= FLOOR) {
  console.log('  FC-C2 PASSES — the candidate clears the floor and may be offered.');
} else if (reduction >= WITHDRAW_BELOW) {
  console.log(
    `  FC-C2 NOT MET (${(FLOOR * 100).toFixed(0)}% required, ${(reduction * 100).toFixed(1)}% measured),\n` +
      `  and above the ${(WITHDRAW_BELOW * 100).toFixed(0)}% at which the withdrawal clause fires. Per\n` +
      `  part-c-conditions.md this is the product owner's decision, with the number and the pictures\n` +
      `  in front of them — NOT a milestone's to take on its own.`,
  );
  process.exitCode = 2;
} else {
  console.log(
    `  FC-C2 FAILS and the withdrawal clause fires: every candidate is below ` +
      `${(WITHDRAW_BELOW * 100).toFixed(0)}%.\n  The layout rule is WITHDRAWN and recorded as measured-and-rejected.`,
  );
  process.exitCode = 1;
}
