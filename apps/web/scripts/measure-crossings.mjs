#!/usr/bin/env node
/**
 * Drive `crossing-probe.ts` in **node** and print FC-C1's answer.
 *
 *   node scripts/measure-crossings.mjs
 *
 * **The non-vacuity control is the first thing checked and this harness THROWS rather than judging
 * when it has nothing to judge** — ADR-0130's rule, after ADR-0097 Landing C produced a `PROCEED`
 * from an `undefined` because the edit meant to supply the number had silently failed.
 *
 * The control is independent rather than a model of the cull: at a framing tall and wide enough to
 * hold the **worst** layout's every lane, nothing is culled, so the number of stroked link
 * polylines the painter emits must equal the number of edges exactly. It does not reproduce the
 * cull, it removes it, so it cannot agree with itself the way a reimplementation would (ADR-0124).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

/**
 * **Every Part C figure is measured with `rollUpSummaries: true`**, and that is a correction to how
 * this harness started. Without it a `WBS_SUMMARY` sits at day 0 with its stored duration — zero on
 * this fixture, so eighteen invisible points at the plan start — where the engine derives its span
 * from its children (`compute.ts:545`, ADR-0035 §24). Found by LOOKING at a rendered picture, which
 * is the method this epic exists to apply, after every number here had already been taken without
 * it. What it changes is recorded in `part-c-m-c0.md`; the short version is that every headline
 * conclusion survived or strengthened and one sub-finding was refuted.
 */
const ROLL_UP = { rollUpSummaries: true };

const out = mkdtempSync(join(tmpdir(), 'sp-cross-'));
const bundle = join(out, 'probe.mjs');

// The esbuild CLI rather than its JS API, for the reason `measure-link-routing.mjs` records: it is
// a transitive dependency of Vite, so under pnpm's strict layout this file cannot import it.
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

const { fc1 } = await import(pathToFileURL(bundle).href);
const result = fc1(FIXTURE, ROLL_UP);

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[diagram-legibility Part C M-C0-T2 / FC-C1] node, ${new Date().toISOString()}`);
console.log(`  commit   ${commit}`);
console.log(`  fixture  p6_torture_test_v1.xer — "Unit 300 Amine", the plan from the screenshot`);
console.log(`  edges    ${result.edges}\n`);

// ---- the non-vacuity control, FIRST ----
const c = result.control;
console.log(`  CONTROL — whole-plan framing, nothing culled (${c.whole.viewport}, ${c.layout}):`);
console.log(
  `    stroked link polylines ${c.whole.visibleLinks}  ·  edges ${c.expectedLinks}  ·  ` +
    `segments ${c.whole.segments}  ·  non-axis-aligned ${c.whole.diagonal}`,
);
if (c.whole.visibleLinks === 0) {
  throw new Error(
    'FC-C1 INDETERMINATE: the painter emitted no stroked link polylines at all, so this run ' +
      'measures nothing. The sentinel attribution has stopped working — check whether the painter ' +
      'still assigns palette.edge directly rather than deriving a tint from it.',
  );
}
if (c.whole.visibleLinks !== c.expectedLinks) {
  throw new Error(
    `FC-C1 INDETERMINATE: at a framing where nothing is culled the painter drew ` +
      `${c.whole.visibleLinks} stroked link polylines against ${c.expectedLinks} edges. The ` +
      `attribution is wrong — one of: the sentinel is picking up another layer, a link draws more ` +
      `than one stroked path, or the framing is not actually holding the whole plan. Refusing to ` +
      `judge until the two agree.`,
  );
}
if (c.whole.diagonal > 0) {
  throw new Error(
    `FC-C1 INDETERMINATE: ${c.whole.diagonal} routed segments are not axis-aligned, which ` +
      `contradicts ADR-0065's rejection of diagonals. The crossing test assumes orthogonality and ` +
      `would silently miss those crossings, so it refuses to report a number.`,
  );
}
console.log(`    control PASSES — every edge accounted for, every segment axis-aligned.\n`);

// ---- the readings ----
console.log('  READINGS (every figure per VISIBLE link, with the denominator beside it):\n');
const rows = result.readings;
for (const r of rows) {
  console.log(
    `    ${r.layout.padEnd(24)} lanes ${String(r.lanes).padStart(4)}  ${r.viewport}  ` +
      `${String(r.pxPerDay).padStart(2)}px/d  originY ${String(r.originY).padStart(5)}  ` +
      `links ${String(r.visibleLinks).padStart(4)}  crossings ${String(r.crossings).padStart(6)}  ` +
      `per link ${r.perLink.toFixed(3)}`,
  );
}

// ---- the verdict, read WHOLE-PLAN ----
//
// FC-C1 says "whole-plan crossings per link", and the sweep above cannot answer it: source order
// spreads the plan over 144 rows, so only 21-52 of the 188 links are ever on screen at once, while
// the shipped 27-row layout shows all 188. A mean over those framings compares different
// sub-populations and would hand the win to whichever layout shows less of the plan at a time —
// the "rewarding a candidate for culling the evidence" trap, in the one costume that survives
// normalising per visible link. Whole-plan, both sides carry all 188 links and only the layout
// differs.
console.log('\n  WHOLE-PLAN (nothing culled — the population FC-C1 names):\n');
for (const w of result.wholePlan) {
  console.log(
    `    ${w.layout.padEnd(24)} lanes ${String(w.lanes).padStart(4)}  ` +
      `links ${String(w.visibleLinks).padStart(4)}  crossings ${String(w.crossings).padStart(6)}  ` +
      `per link ${w.perLink.toFixed(3)}`,
  );
}

const whole = (name) => result.wholePlan.find((w) => w.layout === name) ?? null;
const shippedW = whole('shipped (packed + hint)');
const sourceW = whole('source order');
const scrambleW = whole('scrambled (same height)');

// ---- the reading that FAILED FC-C1 as first written, kept as evidence ----
//
// FC-C1 originally compared the shipped layout against source order, on the premise that a layout
// bad on every existing LENGTH proxy is bad on crossings. It is not — measured, source order is 17%
// BETTER — and that reading is the single most useful number this epic has produced, because it is
// why M-C4 was re-aimed. It is printed rather than deleted.
if (shippedW !== null && sourceW !== null) {
  const lengthRatio = shippedW.perLink === 0 ? Infinity : sourceW.perLink / shippedW.perLink;
  console.log('\n  EVIDENCE — length and crossings are not the same quantity:');
  console.log(
    `    shipped ${shippedW.perLink.toFixed(3)}  vs  source order ${sourceW.perLink.toFixed(3)}  ` +
      `(${lengthRatio.toFixed(2)}x) — the epic's WORST layout on link length is ` +
      `${((1 - lengthRatio) * 100).toFixed(0)}% BETTER on crossings.`,
  );
}

console.log(
  '\n  FC-C1 (amended 2026-09-22) — the metric must separate the shipped layout from a seeded',
);
console.log('  scramble into the SAME number of lanes by >= 2x:');
if (shippedW === null || scrambleW === null) {
  throw new Error(
    'FC-C1 INDETERMINATE: a whole-plan reading is missing for one of the two layouts, so there ' +
      'is nothing to compare. Refusing to judge.',
  );
}
if (shippedW.visibleLinks !== scrambleW.visibleLinks) {
  throw new Error(
    `FC-C1 INDETERMINATE: the two whole-plan readings carry different link populations ` +
      `(${shippedW.visibleLinks} vs ${scrambleW.visibleLinks}), so the comparison is not ` +
      `like-for-like. The framing is not holding one of the layouts whole. Refusing to judge.`,
  );
}
if (shippedW.lanes !== scrambleW.lanes) {
  throw new Error(
    `FC-C1 INDETERMINATE: the scramble occupies ${scrambleW.lanes} lanes against the shipped ` +
      `layout's ${shippedW.lanes}. The amended comparison isolates ASSIGNMENT QUALITY at constant ` +
      `height, and it is not constant. Refusing to judge.`,
  );
}
const shipped = shippedW.perLink;
const scramble = scrambleW.perLink;
console.log(
  `    shipped    ${shipped.toFixed(3)} crossings per link over ${shippedW.visibleLinks} links ` +
    `in ${shippedW.lanes} lanes`,
);
console.log(
  `    scrambled  ${scramble.toFixed(3)} crossings per link over ${scrambleW.visibleLinks} links ` +
    `in ${scrambleW.lanes} lanes`,
);
const ratio = shipped === 0 ? Infinity : scramble / shipped;
console.log(`    ratio      ${ratio === Infinity ? 'infinite' : ratio.toFixed(2)}x\n`);

if (ratio >= 2) {
  console.log('  FC-C1 PASSES. The metric discriminates; candidates may be judged on it.');
} else {
  console.log('  FC-C1 FAILS.');
  console.log('  Per its own withdrawal clause the metric is WRONG and is REPLACED before any');
  console.log('  candidate is measured. Nothing else in M-C0 is worth running until it is.');
  console.log('  NOTE: the comparands were already amended once (2026-09-22, recorded in');
  console.log(
    '  part-c-conditions.md). A second amendment is not available — this is a failure of',
  );
  console.log('  the instrument, not of the pair.');
  process.exitCode = 1;
}
