#!/usr/bin/env node
/**
 * **NetPoint-layout M0-T3 — FC-N2: what one evaluation costs, and whether incremental agrees.**
 *
 *   node scripts/measure-netpoint-cost.mjs
 *
 * At pitch 60 (the product owner's row, substituted in the bundle exactly as `measure-row-pitch.mjs`
 * does) and 4 px/day. Three sizes: Unit 300, `scale-500` and `scale-2000`, each packed on its drawn
 * spans — the layout Re-layout starts from.
 *
 * ## Controls, each of which refuses a verdict
 *
 * 1. **Agreement**: the evaluator's line set digests identically to the painter's on every plan. An
 *    evaluator routing different lines would be optimising a different diagram.
 * 2. **Equivalence (FC-N2c)**: 1,000 seeded moves on Unit 300, each scored incrementally on a live
 *    model and in full from scratch; objective AND line digest must agree on every one.
 * 3. **The equivalence control is verified red**: the same moves with the destination lane's
 *    re-route skipped must disagree at least once, or the check could not have failed.
 *
 * Node timings bound the algorithm, not the product owner's experience (conditions.md "Honest
 * limits"; #75).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const PITCH = 60;
const RUNS = 9;
const MOVES = Number(process.env.MOVES ?? 1000);

const out = mkdtempSync(join(tmpdir(), 'sp-netpoint-cost-'));
const file = join(out, 'evaluate.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/netpoint-evaluate.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${file}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const source = readFileSync(file, 'utf8');
const matches = source.match(/\bvar LANE_HEIGHT = \d+;/g) ?? [];
if (matches.length !== 1)
  throw new Error(`INDETERMINATE: ${String(matches.length)} LANE_HEIGHT declarations`);
writeFileSync(
  file,
  source.replace(/\bvar LANE_HEIGHT = \d+;/, `var LANE_HEIGHT = ${String(PITCH)};`),
);
const m = await import(pathToFileURL(file).href);

const p = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};
const median = (values) => p(values, 0.5);
const fmt = (v) => v.toFixed(1).padStart(8);

const unit = m.unit300Layouts(FIXTURE, { rollUpSummaries: true });
const s500 = m.scalePlan(500);
const s2000 = m.scalePlan(2000);
const plans = [
  { name: 'Unit 300', asap: unit.asap, layout: unit.shipped },
  { name: 'scale-500', asap: s500.asap, layout: m.packedOnDrawn(s500.asap, 'scale-500') },
  { name: 'scale-2000', asap: s2000.asap, layout: m.packedOnDrawn(s2000.asap, 'scale-2000') },
];

console.log(`\n[NetPoint-layout M0-T3] node ${process.version}, ${new Date().toISOString()}`);
console.log(
  `  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}, pitch ${String(PITCH)}, 4 px/day\n`,
);

const rows = [];
for (const plan of plans) {
  const n = plan.asap.activities.length;
  const links = plan.asap.dependencies.length;
  const painter = m.painterDigest(plan.asap, plan.layout);
  const first = m.evaluateFull(plan.asap, plan.layout);
  if (first.digest !== painter) {
    throw new Error(
      `INDETERMINATE: ${plan.name} evaluator digest ${first.digest} ≠ painter ${painter}`,
    );
  }
  const full = [];
  for (let r = 0; r < RUNS; r += 1) full.push(m.evaluateFull(plan.asap, plan.layout).stages);

  // Incremental: nine seeded moves on one live model.
  const rnd = m.prng(0x5eed + n);
  const laneOf = new Map(plan.layout.laneOf);
  const model = m.buildModel(plan.asap, { ...plan.layout, laneOf });
  const keys = plan.asap.activities.map((a) => a.key);
  const inc = [];
  const rerouted = [];
  while (inc.length < RUNS) {
    const key = keys[Math.floor(rnd() * keys.length)];
    const to = Math.floor(rnd() * (plan.layout.lanes + 1));
    if (to === laneOf.get(key)) continue;
    const r = m.applyMoveIncremental(model, plan.asap, laneOf, key, to);
    inc.push(r.stages);
    rerouted.push(r.rerouted);
  }
  rows.push({ plan, n, links, full, inc, rerouted, objective: first.objective });
}

console.log(
  'plan         bars links | FULL p50   p95 | index  route   post  occl  cross  ovlp (median ms) | INCR p50   p95  rerouted(med)',
);
for (const r of rows) {
  const f = r.full.map((s) => s.total);
  const i = r.inc.map((s) => s.total);
  const st = (k) =>
    median(r.full.map((s) => s[k]))
      .toFixed(1)
      .padStart(6);
  console.log(
    `${r.plan.name.padEnd(11)} ${String(r.n).padStart(5)} ${String(r.links).padStart(5)} |${fmt(median(f))}${fmt(p(f, 0.95))} |` +
      `${st('index')} ${st('route')} ${st('post')} ${st('occlusion')} ${st('crossings')} ${st('overlaps')}            |` +
      `${fmt(median(i))}${fmt(p(i, 0.95))}  ${String(median(r.rerouted)).padStart(5)} of ${String(r.links)}`,
  );
}
for (const r of rows) console.log(`  ${r.plan.name} objective: ${JSON.stringify(r.objective)}`);

// ---- FC-N2c: equivalence over MOVES seeded moves, then the red control ----
function equivalence(skipLane) {
  const plan = plans[0];
  const rnd = m.prng(0xc0ffee);
  const laneOf = new Map(plan.layout.laneOf);
  const model = m.buildModel(plan.asap, { ...plan.layout, laneOf });
  const keys = plan.asap.activities.map((a) => a.key);
  let done = 0;
  let disagree = 0;
  let firstAt = -1;
  while (done < MOVES) {
    const key = keys[Math.floor(rnd() * keys.length)];
    let lanes = 0;
    for (const v of laneOf.values()) lanes = Math.max(lanes, v + 1);
    const to = Math.floor(rnd() * (lanes + 1));
    if (to === laneOf.get(key)) continue;
    const incr = m.applyMoveIncremental(model, plan.asap, laneOf, key, to, { skipLane });
    const whole = m.evaluateFull(plan.asap, { name: 'check', laneOf, lanes: lanes + 1 });
    const same =
      incr.digest === whole.digest &&
      m.objectiveKey(incr.objective) === m.objectiveKey(whole.objective);
    if (!same) {
      disagree += 1;
      if (firstAt < 0) firstAt = done;
      // Resynchronise from the truth so one miss does not poison every later comparison.
      model.raw = m.buildModel(plan.asap, { name: 'resync', laneOf, lanes: lanes + 1 }).raw;
    }
    done += 1;
  }
  return { done, disagree, firstAt };
}
const green = equivalence(false);
const red = equivalence(true);
console.log(
  `\nFC-N2c equivalence (Unit 300, ${String(MOVES)} seeded moves): ${String(green.disagree)} disagreements`,
);
console.log(
  `  red control (destination lane's re-route skipped): ${String(red.disagree)} disagreements, first at move ${String(red.firstAt)}`,
);
if (red.disagree === 0)
  throw new Error(
    'INDETERMINATE: the red control did not fire — the equivalence check cannot fail.',
  );
