#!/usr/bin/env node
/**
 * **M5-T1c — what does the link layer look like without the dash?** (logic-legibility)
 *
 *   node scripts/shoot-link-dash.mjs
 *
 * M5-T1 and M5-T1b falsified this milestone's premise in both the ways it could have been true:
 * link ink is 58-114 % of bar ink, and the link resolves to 5.31:1 against the ground — **louder
 * than the on-schedule bar at 3.14:1** and 4.5-5.0x the gridlines. Making it louder is therefore
 * unsupported.
 *
 * What the measurement DOES point at: **124 of 187 links are 1 px dashed**, and a `[4, 3]` dash
 * over a 1,500 px channel run is ~214 separate marks to follow. That is a continuity problem, not
 * a contrast one — and the driving/non-driving cue does not depend on the dash, because it is
 * **already carried by weight** (1 px against 2 px), so dropping the dash keeps WCAG 1.4.1's
 * "not by colour alone" satisfied by a channel that is not colour.
 *
 * Whether that is better is not a thing this harness can decide, and FC-L8 limb 1 says in terms
 * that **a cue that goes is a product-owner decision, not a milestone's**. So it renders the pair
 * and stops. The variant is produced by rewriting the **bundle** (M-C0-T4's method) — nothing in
 * the repository is modified for the length of the run, and the substitution asserts its match
 * count, so a silent miss shows up as two identical pictures rather than as a false conclusion.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const ROLL_UP = { rollUpSummaries: true };
/** The product owner's Surface Pro, and the busiest gutter M1-T4 frames. */
const WIDTH = 1646;
const HEIGHT = 420;
const DPR = 1.75;
const PX_PER_DAY = 12;

const out = mkdtempSync(join(tmpdir(), 'sp-dash-'));
const build = (entry, outfile) => {
  execFileSync(
    'pnpm',
    [
      'exec',
      'esbuild',
      entry,
      '--bundle',
      '--format=esm',
      '--platform=node',
      `--outfile=${outfile}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit' },
  );
  return outfile;
};
const probeFile = build('scripts/crossing-probe.ts', join(out, 'probe.mjs'));
const benchFile = build('scripts/gutter-pitch-bench.ts', join(out, 'bench.mjs'));
const probe = await import(pathToFileURL(probeFile).href);

/**
 * The one line that carries the non-driving dash (`paint.ts`), rewritten in the emitted bundle.
 * Asserted unique: two matches would mean the dash is set somewhere else too and this picture
 * would be of a half-changed painter.
 */
const DASH = 'ctx.setLineDash([4, 3]);\n    drawEdges(false);';
const bench = readFileSync(benchFile, 'utf8');
const occurrences = bench.split(DASH).length - 1;
if (occurrences !== 1) {
  throw new Error(
    `M5-T1c INDETERMINATE: expected exactly one non-driving dash site in the bundle and found ` +
      `${String(occurrences)}. Refusing to render a picture whose caption would be a guess.`,
  );
}
const variants = [
  { slug: 'link-dash-today', label: 'today: non-driving links dashed', source: bench },
  {
    slug: 'link-dash-dropped',
    label: 'variant: the dash dropped, the weight kept',
    source: bench.replace(DASH, 'ctx.setLineDash([]);\n    drawEdges(false);'),
  },
];

const { asap, configs } = probe.unit300BandConfigs(FIXTURE, ROLL_UP);
const config = configs.find((c) => c.layout.name.startsWith('B '));
if (!config) throw new Error('the band-off arranged configuration is missing');
const { scene } = probe.sceneFor(asap, config.layout);
const focusLane = probe.worstOcclusionLane(
  scene,
  { pxPerDay: PX_PER_DAY, originX: 40, originY: 32 },
  { width: 100000, height: 100000 },
).lane;

const tokens = readFileSync('src/styles/globals.css', 'utf8');
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

console.log(`\n[logic-legibility M5-T1c] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log(
  `  framed on lane ${String(focusLane)} at ${String(WIDTH)}x${String(HEIGHT)}, ${String(PX_PER_DAY)} px/day\n`,
);

const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
for (const { slug, label, source } of variants) {
  const file = join(out, `${slug}.mjs`);
  writeFileSync(file, source);
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  await page.setContent(
    `<style>${tokens}</style>
     <style>body{margin:0}#host{background:var(--canvas)}
       #c{display:block;width:${String(WIDTH)}px;height:${String(HEIGHT)}px}</style>
     <div id="host" data-surface="canvas"><canvas id="c"></canvas></div>`,
  );
  await page.addScriptTag({ path: file, type: 'module' });
  await page.evaluate(
    ({ scene: s, lane, width, height, dpr, pxPerDay }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene: s,
        focusLane: lane,
        pxPerDay,
        size: { width, height },
        dpr,
      });
    },
    { scene, lane: focusLane, width: WIDTH, height: HEIGHT, dpr: DPR, pxPerDay: PX_PER_DAY },
  );
  const path = `docs/specs/logic-legibility/${slug}.png`;
  await page.screenshot({ path: join('../..', path) });
  await page.close();
  console.log(`  ${label.padEnd(42)} -> ${path}`);
}
await browser.close();
