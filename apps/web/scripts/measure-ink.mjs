#!/usr/bin/env node
/**
 * **M5-T1 — how much of the picture is bar, and how much is link?** (logic-legibility)
 *
 *   node scripts/measure-ink.mjs
 *
 * M5's outcome is that "the relationship stops being the quietest thing on a surface whose subject
 * is relationships". That is an assertion about the picture's weight, and its first development
 * step says to **measure the distribution and then design** — Part A §4.5 listed four candidate
 * terms and said the design picks from the measurement, not from the list.
 *
 * Both of the M0 fixtures, at both of the widths the product owner's own screens use: **1646**
 * (their Surface Pro at 2880x1920 / 175 %) and **1920**. At the working zoom and at the whole-plan
 * framing, because a figure taken at one zoom is a figure about that zoom — Unit 300's whole span
 * culls nothing while Week culls 2,160 bars to a few hundred (ADR-0128's finding that cost tracks
 * bars drawn rather than plan size, applied to ink).
 *
 * What is counted, what is not, and why a pixel count would lie about criticality is in
 * `inkDistribution`'s docblock. The short version: text is not counted, so every ratio here is
 * bar-versus-link and not a share of all ink.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const ROLL_UP = { rollUpSummaries: true };
const WIDTHS = [1646, 1920];
const HEIGHT = 820;
/** 4 px/day puts Unit 300's whole 391-day span on screen; 12 is the working zoom. */
const ZOOMS = [4, 12];

const out = mkdtempSync(join(tmpdir(), 'sp-ink-'));
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

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[logic-legibility M5-T1] node, ${new Date().toISOString()}`);
console.log(`  commit ${commit}`);
console.log(`  ink is px^2: a link's polyline length x its lineWidth, a bar's w x h. Text is NOT`);
console.log(`  counted (fillText records no geometry), so every ratio is bar-versus-link.\n`);

const { asap, configs } = probe.unit300BandConfigs(FIXTURE, ROLL_UP);
const config = configs.find((c) => c.layout.name.startsWith('B '));
if (!config) throw new Error('the band-off arranged configuration is missing');
const scenes = [
  { name: 'Unit 300 (144 activities)', scene: probe.sceneFor(asap, config.layout).scene },
  (() => {
    const small = probe.smallPlanLayouts();
    return {
      name: 'small plan (17 activities)',
      scene: probe.sceneFor(small.asap, small.shipped).scene,
    };
  })(),
];

console.log(
  `    ${'fixture'.padEnd(26)} ${'w'.padStart(5)} ${'px/d'.padStart(4)} ${'bars'.padStart(5)} ` +
    `${'bar ink'.padStart(9)} ${'links'.padStart(5)} ${'link ink'.padStart(9)} ` +
    `${'solid'.padStart(9)} ${'dashed'.padStart(9)} ${'link:bar'.padStart(8)}`,
);
const rows = [];
for (const { name, scene } of scenes) {
  for (const width of WIDTHS) {
    for (const pxPerDay of ZOOMS) {
      const r = probe.inkDistribution(
        scene,
        { pxPerDay, originX: 40, originY: 32 },
        { width, height: HEIGHT },
      );
      rows.push({ name, width, pxPerDay, ...r });
      const k = (v) => Math.round(v).toLocaleString('en-GB');
      console.log(
        `    ${name.padEnd(26)} ${String(width).padStart(5)} ${String(pxPerDay).padStart(4)} ` +
          `${String(r.barCount).padStart(5)} ${k(r.barInkPx2).padStart(9)} ` +
          `${String(r.linkCount).padStart(5)} ${k(r.linkInkPx2).padStart(9)} ` +
          `${`${String(r.solidLinkCount)}/${k(r.solidLinkInkPx2)}`.padStart(9)} ` +
          `${`${String(r.dashedLinkCount)}/${k(r.dashedLinkInkPx2)}`.padStart(9)} ` +
          `${r.ratio.toFixed(3).padStart(8)}`,
      );
    }
  }
}

// **The control.** A reading in which nothing was drawn is not a measurement of a quiet link layer,
// it is a measurement of nothing — and it looks identical in the ratio column.
if (rows.some((r) => r.barCount === 0 || r.linkCount === 0)) {
  throw new Error(
    'M5-T1 INDETERMINATE: a framing drew no bars or no links, so its ratio describes an empty ' +
      'picture rather than a quiet one. Refusing to report.',
  );
}
console.log('\n  CONTROL PASSES — every framing drew both bars and links.');

console.log('\n  Per-mark weight — what "quiet" actually means\n');
console.log(
  `    ${'fixture'.padEnd(26)} ${'px/d'.padStart(4)} ${'mean bar h'.padStart(10)} ` +
    `${'link widths'.padStart(20)} ${'link:bar weight'.padStart(15)}`,
);
for (const r of rows.filter((x) => x.width === 1646)) {
  const widths = Object.entries(r.linkWidths)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([w, n]) => `${w}px x${String(n)}`)
    .join(', ');
  console.log(
    `    ${r.name.padEnd(26)} ${String(r.pxPerDay).padStart(4)} ` +
      `${r.barHeightPx.toFixed(2).padStart(10)} ${widths.padStart(20)} ` +
      `${r.weightRatio.toFixed(3).padStart(15)}`,
  );
}

const worst = rows.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
const best = rows.reduce((a, b) => (a.ratio >= b.ratio ? a : b));
console.log(
  `\n  Link ink runs from ${(worst.ratio * 100).toFixed(1)}% of bar ink ` +
    `(${worst.name}, ${String(worst.width)} px, ${String(worst.pxPerDay)} px/day) to ` +
    `${(best.ratio * 100).toFixed(1)}% (${best.name}, ${String(best.width)} px, ` +
    `${String(best.pxPerDay)} px/day).`,
);
const dashedShare = rows.map((r) => r.dashedLinkInkPx2 / r.linkInkPx2);
console.log(
  `  Dashed links carry ${(Math.min(...dashedShare) * 100).toFixed(1)}-` +
    `${(Math.max(...dashedShare) * 100).toFixed(1)}% of link ink before the dash pattern is ` +
    'applied, so their drawn ink is materially lower again.',
);
