#!/usr/bin/env node
/**
 * **logic-legibility M0-T4 — the small fixture asserts its own five properties (FC-L12).**
 *
 *   node scripts/measure-small-plan.mjs
 *
 * The product owner reported the defect on a **simple** plan, and Unit 300 is 144 activities. A
 * fixture built for this epic could easily be sparse enough to exhibit nothing while passing every
 * condition — and would then be quoted as evidence that small plans are fine. So the fixture's
 * value is its **logic density**, and these five properties are its test.
 *
 * Every one is asserted **after `packLanes` has run**, not as authored, because every one is a
 * property of the LAYOUT rather than of the network: which activities share a lane, which corridor
 * positions are blocked, which gutter runs overlap. Authoring cannot guarantee any of them.
 *
 * The control is the sparse variant — the same thirteen activities with the main chain only. It is
 * run second, and the properties must FAIL on it. A fixture that cannot be made to fail its own
 * properties is describing them rather than asserting them.
 *
 * **This is a harness, not a CI gate, and that is stated so nobody reads it as one.** The repo's
 * `scripts/*.test.mjs` gates are plain node; these properties need the bundled render path, which
 * is the same reason every other `measure-*.mjs` beside it is run by hand at a milestone.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'sp-small-'));
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
const probe = await import(pathToFileURL(bundle).href);
const { smallPlanLayouts } = probe;

const PX_PER_DAY = 12; // a small plan is read zoomed IN, which is the framing the complaint is about

/** The five properties, measured on one layout. Each returns a number and the rule it must meet. */
function properties(sparse) {
  const { asap, shipped } = smallPlanLayouts({ sparse });
  const r = probe.readBoth(asap, shipped, PX_PER_DAY, 32);
  const density = asap.dependencies.length / asap.activities.length;

  // P2 needs the LAYOUT: two activities sharing a lane with a third between them in time, and a
  // link joining the outer two. That is spec §0.3's mechanism, and `routeOrthogonal` returns
  // `[from, to]` for it before obstacles are ever consulted (`link-routing.ts:182`).
  const laneOf = shipped.laneOf;
  const spanOf = (k) => [asap.start.get(k) ?? 0, asap.finish.get(k) ?? 0];
  let sameLaneOverC = 0;
  for (const d of asap.dependencies) {
    const lane = laneOf.get(d.predecessorKey);
    if (lane === undefined || laneOf.get(d.successorKey) !== lane) continue;
    const [aStart, aFinish] = spanOf(d.predecessorKey);
    const [cStart, cFinish] = spanOf(d.successorKey);
    const lo = Math.min(aStart, cStart);
    const hi = Math.max(aFinish, cFinish);
    const between = asap.activities.some(
      (x) =>
        x.key !== d.predecessorKey &&
        x.key !== d.successorKey &&
        laneOf.get(x.key) === lane &&
        (asap.start.get(x.key) ?? 0) > lo &&
        (asap.finish.get(x.key) ?? 0) < hi,
    );
    if (between) sameLaneOverC += 1;
  }

  const model = probe.avoidableOcclusions(asap, shipped, PX_PER_DAY, 32);
  // P3: a link the router cannot rescue with any of its own candidate corridors. `modelForeign`
  // minus `avoidable` is exactly that population.
  const noCandidateWorks = model.modelForeignLinks - model.avoidable;

  return {
    lanes: shipped.lanes,
    links: r.visibleLinks,
    activities: asap.activities.length,
    P1_density: density,
    P2_sameLaneOverC: sameLaneOverC,
    P3_noCandidateWorks: noCandidateWorks,
    P4_occlPerLink: r.foreignLinks / r.visibleLinks,
    P5_maxLegsOnOneY: r.maxLegsOnOneY,
    gutterLegs: r.gutterLegs,
  };
}

const RULES = [
  [
    'P1  links per activity      >= 1.30',
    (p) => p.P1_density >= 1.3,
    (p) => p.P1_density.toFixed(2),
  ],
  [
    'P2  same-lane A->C over B   >= 1',
    (p) => p.P2_sameLaneOverC >= 1,
    (p) => String(p.P2_sameLaneOverC),
  ],
  [
    'P3  no candidate corridor   >= 1',
    (p) => p.P3_noCandidateWorks >= 1,
    (p) => String(p.P3_noCandidateWorks),
  ],
  [
    'P4  occl/link               >  0',
    (p) => p.P4_occlPerLink > 0,
    (p) => p.P4_occlPerLink.toFixed(3),
  ],
  [
    'P5  max legs on one y       >= 2',
    (p) => p.P5_maxLegsOnOneY >= 2,
    (p) => String(p.P5_maxLegsOnOneY),
  ],
];

console.log(`\n[logic-legibility M0-T4 / FC-L12] node, ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log(`  a single-storey extension, ${String(PX_PER_DAY)} px/day, band off\n`);

const report = (label, sparse) => {
  const p = properties(sparse);
  console.log(
    `  ${label} — ${String(p.activities)} activities, ${String(p.links)} links, ` +
      `${String(p.lanes)} rows, ${String(p.gutterLegs)} gutter legs`,
  );
  let passed = 0;
  for (const [name, rule, show] of RULES) {
    const ok = rule(p);
    if (ok) passed += 1;
    console.log(`      ${ok ? 'PASS' : 'FAIL'}  ${name}   measured ${show(p)}`);
  }
  console.log('');
  return passed;
};

const rich = report('THE FIXTURE ', false);
const sparse = report('sparse (control)', true);

if (rich !== RULES.length) {
  throw new Error(
    `The fixture fails ${String(RULES.length - rich)} of its own ${String(RULES.length)} ` +
      `properties. It does not exhibit what this epic is about, and no reading taken on it means ` +
      `anything. Refusing to accept it.`,
  );
}
if (sparse === RULES.length) {
  throw new Error(
    `The SPARSE control passes all ${String(RULES.length)} properties too, so the properties are ` +
      `describing the fixture rather than asserting anything about it (FC-L12). Refusing to ` +
      `accept it.`,
  );
}
console.log(
  `  FC-L12 SATISFIED — the fixture passes ${String(rich)}/${String(RULES.length)} and the sparse\n` +
    `  control passes ${String(sparse)}/${String(RULES.length)}, so the properties discriminate.\n`,
);
