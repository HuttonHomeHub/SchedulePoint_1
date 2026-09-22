#!/usr/bin/env node
/**
 * **M-C0-T3 — does compressing the diagram raise crossings per link?** (CQ-C4's held flip)
 *
 *   node scripts/measure-band-compression.mjs
 *
 * `part-c-conditions.md` holds the WBS band's derived default until this reports. The premise of
 * turning the band on is that a shorter diagram is a better one, and that has never been measured:
 * 12 rows offer 11 gutters where 27 offer 26, against an unchanged 188 links.
 *
 * **The control is checked first and this harness THROWS rather than judging** (ADR-0130). Two
 * things have to hold before any figure means anything:
 *
 *  1. Every configuration carries all 188 links. Band on removes 18 summary BARS from the scene,
 *     and `paint.ts:1206-1207` silently drops an edge whose endpoint is not in the scene — so if a
 *     summary were a dependency endpoint the band-on readings would quietly carry a smaller
 *     population and the comparison would be against a different plan. ADR-0038 says a summary
 *     never is one; this ASSERTS it rather than citing it.
 *  2. No segment is non-axis-aligned, which the crossing test assumes (ADR-0065).
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

const out = mkdtempSync(join(tmpdir(), 'sp-band-'));
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

const { t3 } = await import(pathToFileURL(bundle).href);
const result = t3(FIXTURE, ROLL_UP);

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[diagram-legibility Part C M-C0-T3 / CQ-C4] node, ${new Date().toISOString()}`);
console.log(`  commit   ${commit}`);
console.log(`  fixture  p6_torture_test_v1.xer — "Unit 300 Amine", the plan from the screenshot`);
console.log(`  edges    ${result.edges}\n`);

// ---- the control, FIRST ----
for (const r of result.readings) {
  if (r.visibleLinks !== result.edges) {
    throw new Error(
      `M-C0-T3 INDETERMINATE: "${r.layout}" at ${r.pxPerDay}px/d drew ${r.visibleLinks} stroked ` +
        `link polylines against ${result.edges} edges. Either the framing is culling — in which ` +
        `case the taller configurations are being compared on a smaller population and the whole ` +
        `reading is worthless — or a WBS summary IS a dependency endpoint, which contradicts ` +
        `ADR-0038 and makes band-on a different plan rather than a shorter picture of the same ` +
        `one. Refusing to judge.`,
    );
  }
  if (r.paintedActivities !== r.bars) {
    throw new Error(
      `M-C0-T3 INDETERMINATE: "${r.layout}" declares ${r.bars} painted bars and the painter was ` +
        `handed ${r.paintedActivities} activities. The band filter did not reach the painter, so ` +
        `a band-on reading identical to its band-off sibling would mean nothing. Refusing to judge.`,
    );
  }
  if (r.diagonal > 0) {
    throw new Error(
      `M-C0-T3 INDETERMINATE: "${r.layout}" at ${r.pxPerDay}px/d emitted ${r.diagonal} ` +
        `non-axis-aligned segments, which the crossing test assumes cannot happen (ADR-0065). ` +
        `Those crossings would be missed silently. Refusing to judge.`,
    );
  }
}
console.log(
  `  CONTROL PASSES — every configuration carries all ${result.edges} links, the painter was ` +
    `handed the declared bar count in each, and every segment is axis-aligned.\n`,
);

// ---- the readings ----
console.log('  WHOLE-PLAN READINGS (nothing culled anywhere; per link over an identical 188):\n');
console.log(
  `    ${'configuration'.padEnd(30)} ${'band'.padEnd(5)} ${'arrangement'.padEnd(20)} ` +
    `${'rows'.padStart(5)} ${'bars'.padStart(5)} ${'px/d'.padStart(5)} ` +
    `${'crossings'.padStart(10)} ${'per link'.padStart(9)}  routes`,
);
for (const r of result.readings) {
  console.log(
    `    ${r.layout.padEnd(30)} ${r.band.padEnd(5)} ${r.arrangement.padEnd(20)} ` +
      `${String(r.lanes).padStart(5)} ${String(r.bars).padStart(5)} ` +
      `${String(r.pxPerDay).padStart(5)} ${String(r.crossings).padStart(10)} ` +
      `${r.perLink.toFixed(3).padStart(9)}  ${r.fingerprint}`,
  );
}

const at = (prefix, px) =>
  result.readings.find((r) => r.layout.startsWith(prefix) && r.pxPerDay === px) ?? null;

const pct = (from, to) => ((to - from) / from) * 100;
const arrow = (d) => (d > 0.5 ? 'WORSE' : d < -0.5 ? 'better' : 'no change');

// ---- the decision: what the planner meets when the default flips ----
// Row counts are READ from the readings, never restated: the summary rollup moved the shipped
// layout from 27 lanes to 21, and a hard-coded caption would have gone on printing the old number
// over the new figures — the exact defect this epic keeps finding in documents.
const rowsOf = (prefix) => String(at(prefix, result.zooms[0])?.lanes ?? '?');
const blankRows = String(
  result.configs.find((c) => c.layout.name.startsWith('E '))?.summaryOnlyLanes ?? 0,
);
console.log(`\n  CQ-C4 — the flip the planner meets: B (band off, arranged, ${rowsOf('B ')} rows)`);
console.log(`          → D (band on, arranged, ${rowsOf('D ')} rows).\n`);
let decisionWorse = 0;
for (const px of result.zooms) {
  const b = at('B ', px);
  const d = at('D ', px);
  if (b === null || d === null) {
    throw new Error('M-C0-T3 INDETERMINATE: a configuration is missing. Refusing to judge.');
  }
  const change = pct(b.perLink, d.perLink);
  if (change > 0.5) decisionWorse += 1;
  console.log(
    `    ${String(px).padStart(2)}px/d  ${b.lanes} rows ${b.perLink.toFixed(3)} → ` +
      `${d.lanes} rows ${d.perLink.toFixed(3)}   ${change >= 0 ? '+' : ''}${change.toFixed(1)}%  ` +
      `${arrow(change)}`,
  );
}

// ---- the mechanism: compression and nothing else ----
console.log(`\n  MECHANISM — E (band on, pre-#364, ${rowsOf('E ')} rows incl. ${blankRows} blank)`);
console.log(
  `              → D (band on, #364, ${rowsOf('D ')} rows). Identical bars, identical links.\n`,
);
let mechanismWorse = 0;
for (const px of result.zooms) {
  const e = at('E ', px);
  const d = at('D ', px);
  if (e === null || d === null) {
    throw new Error('M-C0-T3 INDETERMINATE: a configuration is missing. Refusing to judge.');
  }
  const change = pct(e.perLink, d.perLink);
  if (change > 0.5) mechanismWorse += 1;
  console.log(
    `    ${String(px).padStart(2)}px/d  ${e.lanes} rows ${e.perLink.toFixed(3)} → ` +
      `${d.lanes} rows ${d.perLink.toFixed(3)}   ${change >= 0 ? '+' : ''}${change.toFixed(1)}%  ` +
      `${arrow(change)}`,
  );
}

console.log('\n  VERDICT');
if (decisionWorse > 0) {
  console.log(
    `    Crossings per link RISE at ${decisionWorse} of ${result.zooms.length} zooms across the ` +
      `flip.\n    Per CQ-C4's withdrawal clause the band default stays OFF, the dock still offers ` +
      `the press,\n    and the finding is filed. It is NOT an argument for reverting #364 — the ` +
      `${blankRows} rows it removes paint\n    nothing whatever the band does.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `    Crossings per link do not rise at any measured zoom. CQ-C4's held flip is CLEAR to land ` +
      `at M-C2\n    on this limb; the Viewer-cannot-clear-it argument is already answered by the ` +
      `derived predicate.`,
  );
}
if (decisionWorse > 0 !== mechanismWorse > 0) {
  console.log(
    `\n    NOTE: the decision and the mechanism DISAGREE. That is itself a finding — it means the ` +
      `\n    18 summary bars the band removes are doing work the row count is not, in the router's ` +
      `\n    obstacle index. Record it; do not average the two.`,
  );
}

// ---- what the fingerprints say about the obstacle index ----
//
// A crossing count is a lossy summary of a picture: two readings can agree on it while drawing
// different lines. The fingerprint is the picture. Band on removes 18 summary BARS, which are
// obstacles the router steers around (ADR-0065 M2) — so if the routes are byte-identical with and
// without them, the obstacle half of the router did nothing on this plan, and that is a finding
// about the router rather than about the band.
console.log('\n  OBSTACLE AWARENESS — do the 18 summary bars move any line?\n');
const off = (prefix, px) =>
  result.routingOff.find((r) => r.layout.startsWith(prefix) && r.pxPerDay === px) ?? null;
for (const px of result.zooms) {
  const b = at('B ', px);
  const e = at('E ', px);
  const bOff = off('B ', px);
  if (b === null || e === null || bOff === null) continue;
  // The discriminator FIRST: `linkRouting: false` is the pre-ADR-0065 route, so if it fingerprints
  // the same as `true` the obstacle-aware branch was never taken and any identity below is a fact
  // about this harness rather than about the plan.
  if (b.fingerprint === bOff.fingerprint) {
    throw new Error(
      `M-C0-T3 INDETERMINATE at ${px}px/d: painting with scene.linkRouting OFF produced the same ` +
        `routes as ON. The obstacle-aware branch (paint.ts:1091-1098, :1184-1189) is not being ` +
        `exercised, so "the summary bars move no line" would be a statement about the harness. ` +
        `Refusing to judge.`,
    );
  }
  const same = b.fingerprint === e.fingerprint;
  console.log(
    `    ${String(px).padStart(2)}px/d  routing off ${bOff.fingerprint}  ·  on, band off ` +
      `${b.fingerprint}  ·  on, band on ${e.fingerprint}   ` +
      `${same ? 'the 18 summary bars move NO line' : 'the summary bars move lines'}`,
  );
}

// …and WHY, measured rather than reasoned. `routeOrthogonal` returns today's elbow unexamined when
// the two endpoints are within one lane of each other (`link-routing.ts:191-193`), so only a
// spanning link can consult an obstacle — and an obstacle only differs between band on and band off
// in a lane holding nothing but band-drawn summaries.
console.log('\n  WHY — how many links can even see the rows the band empties?\n');
for (const c of result.configs) {
  console.log(
    `    ${c.layout.name.padEnd(30)} rows ${String(c.layout.lanes).padStart(4)}  ` +
      `summary-only lanes ${String(c.summaryOnlyLanes).padStart(3)}  ` +
      `spanning links ${String(c.spanningLinks).padStart(4)} of ${result.edges}  ` +
      `of which cross a summary-only lane ${c.spanningLinksOverSummaryOnlyLane}`,
  );
}
