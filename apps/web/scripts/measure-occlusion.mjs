#!/usr/bin/env node
/**
 * **logic-legibility M0 — how often does a link disappear behind a bar?**
 *
 *   node scripts/measure-occlusion.mjs
 *
 * The product owner used `web-v0.141.0` (ADR-0149) and reported that nothing they can see had
 * changed: "the logic is still difficult to read. even for a simple plan the logic is mapping
 * across other bars". This measures the quantity they are describing, which Part C never did.
 *
 * ## The columns, and why `through` and `tangent` are separate
 *
 *   - `x/link`     crossings per link — link-versus-link, what ADR-0149 cut by 20.8 %.
 *   - `through`    links with a horizontal leg running **strictly inside** a bar's vertical extent.
 *   - `tangent`    links whose worst leg sits **exactly on** a bar's top or bottom edge, and no
 *                  worse. A VHV gutter leg, by construction: `gutterY` expands to exactly the upper
 *                  lane's bar bottom at every pitch (ADR-0149 D3).
 *   - `inc`/`tinc` the incident counts behind those two — a link can be occluded many times over.
 *   - `grazing`    legs touching a bar's edge with ZERO length inside it — an anchor's signature,
 *                  excluded from the counts above and reported here rather than dropped silently.
 *                  Measured with the router's CLOSED predicate instead, this plan reads 100 %
 *                  occluded with 391 of 395 incidents self-anchored; that is the artefact the open
 *                  containment removes, and its size is why the exclusion is justified.
 *   - `buried`     total pixels of horizontal leg lying inside a bar. A leg buried forty pixels and
 *                  one grazing half a pixel are not the same defect.
 *   - `foreign`    incidents against a bar that is NOT one of the link's own anchors — FC-L4's
 *                  avoidable denominator. Running over your own bar is what a backward link does by
 *                  construction and is not the complaint; running over somebody else's is.
 *
 * **The first reading of this epic, 77.1 %, was taken before `tangent` existed and is a FLOOR** —
 * strict interiority scored every gutter leg zero, including the 58 of Unit 300's 68 that M-C0-T4
 * measured as lying inside a painted bar at 0.0 px clearance. `conditions.md` §0.2 binds every
 * document quoting that number to say so.
 *
 * ## The FC-L0 vector (M0-T2)
 *
 * Section A sweeps zooms {1, 4, 12} x pans {0, 32, 200, 500} on the shipped layout and prints the
 * condition's whole vector. The pan sweep is not an expectation of variation: `originY` shifts every
 * lane and every leg together, so occlusion should be pan-invariant, and printing it is how that is
 * ESTABLISHED rather than assumed. `vhv-gutter-probe.ts` records that `originY: 0` is the single
 * value at which a whole class of gutter defect is invisible, which is why 0 is swept DELIBERATELY
 * rather than avoided, and why no reading is taken at one pan alone.
 *
 * **The pans are positive, and the plan's literal {32, -200, -500} could not be used.** A negative
 * `originY` lifts the scene above the viewport's top edge, `paint.ts` culls what is off screen, and
 * FC-L0's own non-vacuity control then refuses the reading — correctly: at -200 it reports 135
 * attributed polylines against 188 edges, and a whole-plan figure taken over two thirds of the plan
 * is the "rewarding a candidate for culling the evidence" failure that condition exists to catch.
 * Positive pans move the same phase through the same modulo arithmetic with every edge still drawn.
 *
 * ## Two layouts
 *
 * ADR-0149 D5 withdrew the layout rule on the FIRST quantity, and the product owner has since
 * removed the height cap entirely ("as many rows as it takes"):
 *   - shipped      `packLanes`, fewest lanes with no same-lane time overlap.
 *   - one-per-row  every activity its own lane. The extreme, not a proposal — it is the control
 *                  that says whether height is a lever for occlusion at all.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

const out = mkdtempSync(join(tmpdir(), 'sp-occl-'));
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
const { unit300Layouts, readBoth } = await import(pathToFileURL(bundle).href);

// `rollUpSummaries: true` is mandatory for every Part C/D reading: the harness otherwise places
// each WBS_SUMMARY at day 0, which `part-c-m-c0.md` records as an instrument defect found by
// looking at a rendered picture after every number had already been taken. `asap` comes from the
// same call that builds the shipped layout, so the two cannot describe different plans.
const { asap, shipped } = unit300Layouts(FIXTURE, { rollUpSummaries: true });

const keys = asap.activities.map((a) => a.key);
const onePerRow = {
  name: 'one-per-row',
  laneOf: new Map(keys.map((k, i) => [k, i])),
  lanes: keys.length,
};

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();

// Symptom (c). A pure property of the assignment — no zoom or pan term — so it is computed once per
// layout from the same `asap` the scene is built from, rather than re-derived per reading.
const meanAbsDeltaLane = (layout) => {
  const deps = asap.dependencies;
  if (deps.length === 0) return 0;
  let total = 0;
  for (const d of deps) {
    total += Math.abs(
      (layout.laneOf.get(d.predecessorKey) ?? 0) - (layout.laneOf.get(d.successorKey) ?? 0),
    );
  }
  return total / deps.length;
};

console.log(`\n[logic-legibility M0-T2 / FC-L0] node, ${new Date().toISOString()}`);
console.log(`  commit ${commit}`);
console.log(`  Unit 300 — ${String(keys.length)} activities, WBS band OFF, shipped layout`);
console.log(
  `  mean |Δlane| = ${meanAbsDeltaLane(shipped).toFixed(3)} over ${asap.dependencies.length} edges\n`,
);
console.log(
  `    ${'zoom'.padStart(5)} ${'pan'.padStart(6)} ${'links'.padStart(5)} ${'occl/link'.padStart(9)} ` +
    `${'x/link'.padStart(6)} ${'maxLegs/y'.padStart(9)} ${'gutter'.padStart(6)} ` +
    `${'touching'.padStart(8)} ${'band'.padStart(6)} ${'fingerprint'.padStart(12)}`,
);

const vector = [];
for (const pxPerDay of [1, 4, 12]) {
  for (const originY of [0, 32, 200, 500]) {
    const r = readBoth(asap, shipped, pxPerDay, originY);
    vector.push({ pxPerDay, originY, ...r });
    // **The non-vacuity control, per row and throwing.** A metric that examined nothing reports zero
    // of everything and looks like a triumph (FC-L0). Two limbs: every edge is attributed, and no
    // segment is diagonal — ADR-0065 rejected diagonals, so one is a recorder fault, not a route.
    if (r.visibleLinks !== r.edges) {
      throw new Error(
        `VACUOUS: ${r.visibleLinks} attributed polylines against ${r.edges} edges at ` +
          `${pxPerDay} px/day, pan ${originY}. Refusing to judge.`,
      );
    }
    if (r.diagonal !== 0) {
      throw new Error(
        `NON-AXIS-ALIGNED: ${r.diagonal} segments at ${pxPerDay} px/day, pan ${originY}. ` +
          `ADR-0065 rejected diagonals, so the recorder is reading something that is not a route.`,
      );
    }
    console.log(
      `    ${String(pxPerDay).padStart(5)} ${String(originY).padStart(6)} ${String(r.visibleLinks).padStart(5)} ` +
        `${(r.foreignLinks / r.visibleLinks).toFixed(3).padStart(9)} ${r.perLink.toFixed(3).padStart(6)} ` +
        `${String(r.maxLegsOnOneY).padStart(9)} ${String(r.gutterLegs).padStart(6)} ` +
        `${String(r.legsTouchingABar).padStart(8)} ${`${String(r.clearBandPx)}/${String(r.usableBandPx)}`.padStart(6)} ` +
        `${r.fingerprint.padStart(12)}`,
    );
  }
}

const panInvariant = (key) =>
  [1, 4, 12].every(
    (z) => new Set(vector.filter((v) => v.pxPerDay === z).map((v) => v[key])).size === 1,
  );
console.log(
  `\n  pan-invariant: occlusion ${panInvariant('foreignLinks') ? 'YES' : 'NO'}, ` +
    `crossings ${panInvariant('crossings') ? 'YES' : 'NO'}, ` +
    `gutter legs ${panInvariant('gutterLegs') ? 'YES' : 'NO'}, ` +
    `max legs on one y ${panInvariant('maxLegsOnOneY') ? 'YES' : 'NO'}`,
);
console.log(`  rows: ${String(shipped.lanes)} (reported, never scored — decision 2)\n`);

console.log(`\n[logic-legibility M0 / FC-L1] node, ${new Date().toISOString()}`);
console.log(`  commit ${commit}`);
console.log(`  Unit 300 — ${String(keys.length)} activities, WBS band OFF (summaries rolled up)\n`);
console.log(
  `    ${'layout'.padEnd(13)} ${'rows'.padStart(4)} ${'links'.padStart(5)} ${'x/link'.padStart(6)} ` +
    `${'through'.padStart(14)} ${'tangent'.padStart(14)} ${'inc'.padStart(5)} ${'tinc'.padStart(5)} ` +
    `${'grazing'.padStart(7)} ${'buried px'.padStart(10)} ${'foreign'.padStart(15)}`,
);

const rows = [];
for (const pxPerDay of [4, 12]) {
  console.log(`  — ${String(pxPerDay)} px/day —`);
  for (const layout of [shipped, onePerRow]) {
    const r = readBoth(asap, layout, pxPerDay);
    const n = r.visibleLinks;
    const pct = (v) => (n === 0 ? 0 : (v / n) * 100);
    rows.push({ pxPerDay, name: layout.name, ...r, pctThrough: pct(r.occluded) });
    const cell = (v) => `${String(v).padStart(4)} (${pct(v).toFixed(1).padStart(5)}%)`;
    console.log(
      `    ${layout.name.padEnd(13)} ${String(r.lanes).padStart(4)} ${String(n).padStart(5)} ` +
        `${r.perLink.toFixed(3).padStart(6)} ${cell(r.occluded).padStart(14)} ` +
        `${cell(r.tangentOnly).padStart(14)} ${String(r.incidents).padStart(5)} ` +
        `${String(r.tangentIncidents).padStart(5)} ${String(r.grazing).padStart(7)} ` +
        `${Math.round(r.buriedPx).toLocaleString('en-GB').padStart(10)} ` +
        `${String(r.foreign).padStart(4)} inc /${String(r.foreignLinks).padStart(4)} links`,
    );
  }
}

// **The classifier's control, FIRST and throwing.** `foreign` separates a bar the link has no
// business touching from the link's own anchors, and it is a geometric heuristic rather than an
// identity — a recorded polyline carries no link id. At one-bar-per-lane no lane holds a foreign bar
// at all, so the only honest reading there is ZERO. Predicted before the first run; if it ever
// prints otherwise the heuristic is wrong and every `foreign` figure below is worthless.
for (const row of rows.filter((r) => r.name === 'one-per-row')) {
  if (row.foreign !== 0) {
    throw new Error(
      `INDETERMINATE: one-per-row reports ${row.foreign} FOREIGN incidents at ` +
        `${row.pxPerDay} px/day, and one bar per lane cannot produce one. The own/foreign ` +
        `discriminator is wrong. Refusing to judge.`,
    );
  }
}

// The second control: every reading must carry the same link population, or the layouts are not
// being compared like for like and the deltas below mean nothing (ADR-0130's rule, M-C4's
// precedent).
const links = rows[0].visibleLinks;
for (const row of rows.filter((r) => r.pxPerDay === rows[0].pxPerDay)) {
  if (row.visibleLinks !== links) {
    throw new Error(
      `INDETERMINATE: "${row.name}" carries ${row.visibleLinks} links against ${links}. ` +
        `The framing is culling one of them. Refusing to judge.`,
    );
  }
}

console.log('');
for (const pxPerDay of [4, 12]) {
  const a = rows.find((r) => r.pxPerDay === pxPerDay && r.name === shipped.name);
  const b = rows.find((r) => r.pxPerDay === pxPerDay && r.name === 'one-per-row');
  if (!a || !b) continue;
  const rel = (x, y) => (x === 0 ? 0 : ((y - x) / x) * 100);
  const dOcc = rel(a.pctThrough, b.pctThrough);
  const dX = rel(a.perLink, b.perLink);
  console.log(
    `  ${String(pxPerDay)} px/day: one-per-row moves THROUGH-occlusion ${dOcc >= 0 ? '+' : ''}${dOcc.toFixed(1)}% ` +
      `and crossings/link ${dX >= 0 ? '+' : ''}${dX.toFixed(1)}%  (${String(a.lanes)} rows -> ${String(b.lanes)})`,
  );
}
console.log(
  '\n  Height was withdrawn as a lever on CROSSINGS (ADR-0149 D5). This says whether it is one\n' +
    '  for OCCLUSION, which is the quantity the complaint is about. Quote `through` with the word\n' +
    '  FLOOR unless `tangent` is quoted beside it.\n',
);
