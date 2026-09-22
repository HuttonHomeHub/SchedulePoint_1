#!/usr/bin/env node
/**
 * **Part D M0 — how often does a link disappear behind a bar?**
 *
 *   node scripts/measure-occlusion.mjs
 *
 * The product owner used `web-v0.141.0` (ADR-0149) and reported that nothing they can see had
 * changed: "the logic is still difficult to read. even for a simple plan the logic is mapping
 * across other bars". This measures the quantity they are describing, which Part C never did.
 *
 * Two figures on every row:
 *   - `x/link`  crossings per link — link-versus-link, what ADR-0149 cut by 20.8 %.
 *   - `occl`    the share of links with a horizontal leg running through a bar — link-versus-BAR.
 *
 * And two layouts, because ADR-0149 D5 withdrew the layout rule on the FIRST quantity and the
 * product owner has since removed the height cap entirely ("as many rows as it takes"):
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

console.log(`\n[diagram-legibility Part D M0] node, ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log(`  Unit 300 — ${String(keys.length)} activities\n`);
console.log('    layout             rows   links   x/link   occluded links   incidents');

const rows = [];
for (const pxPerDay of [4, 12]) {
  console.log(`  — ${String(pxPerDay)} px/day —`);
  for (const layout of [shipped, onePerRow]) {
    const r = readBoth(asap, layout, pxPerDay);
    const pct = r.visibleLinks === 0 ? 0 : (r.occluded / r.visibleLinks) * 100;
    rows.push({ pxPerDay, name: layout.name, ...r, pct });
    console.log(
      `    ${layout.name.padEnd(18)} ${String(r.lanes).padStart(4)}  ${String(r.visibleLinks).padStart(6)}   ` +
        `${r.perLink.toFixed(3)}    ${String(r.occluded).padStart(4)} (${pct.toFixed(1).padStart(5)}%)   ${String(r.incidents).padStart(6)}`,
    );
  }
}

console.log('');
for (const pxPerDay of [4, 12]) {
  const a = rows.find((r) => r.pxPerDay === pxPerDay && r.name === shipped.name);
  const b = rows.find((r) => r.pxPerDay === pxPerDay && r.name === 'one-per-row');
  if (!a || !b) continue;
  const dOcc = a.pct === 0 ? 0 : ((b.pct - a.pct) / a.pct) * 100;
  const dX = a.perLink === 0 ? 0 : ((b.perLink - a.perLink) / a.perLink) * 100;
  console.log(
    `  ${String(pxPerDay)} px/day: one-per-row moves OCCLUSION ${dOcc >= 0 ? '+' : ''}${dOcc.toFixed(1)}% ` +
      `and crossings/link ${dX >= 0 ? '+' : ''}${dX.toFixed(1)}%  (${String(a.lanes)} rows -> ${String(b.lanes)})`,
  );
}
console.log(
  '\n  Height was withdrawn as a lever on CROSSINGS (ADR-0149 D5). This says whether it is one\n' +
    '  for OCCLUSION, which is the quantity the complaint is about.\n',
);
