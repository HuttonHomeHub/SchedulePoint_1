#!/usr/bin/env node
/**
 * **logic-legibility M1-T4 — the busiest gutter, photographed** (FC-L3's third limb).
 *
 *   node scripts/shoot-gutter-channels.mjs
 *
 * FC-L3's arithmetic can be satisfied by channels one pixel apart, which a reader cannot use. Its
 * third limb is therefore FC-C3's wording kept verbatim — _"two runs through one gutter read as two
 * lines, clear of both bar edges"_ — and it is judged on a rendered image at 1646, not on a number.
 *
 * The frame is the **busiest gutter**, measured rather than chosen (`sceneForShot`), because a
 * picture of a quiet gutter shows a case nobody complained about.
 *
 * Painted by the real `paintScene` against a real Chromium 2D context with the real
 * `resolveTsldPalette` under ADR-0102's canvas surface scope.
 *
 * **This is M1's PROGRESS reading, not the epic's verdict.** At today's 28/18 geometry the clear
 * band is 10 px and yields three channels; FC-L3's amendment takes the epic's verdict at M3's
 * geometry, where a NetPoint-thin bar makes the same derivation yield seven.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const ROLL_UP = { rollUpSummaries: true };
/** The product owner's Surface Pro: 2880x1920 at 175 % = 1646 CSS px. */
const WIDTH = 1646;
const HEIGHT = 420;
const DPR = 1.75;

const out = mkdtempSync(join(tmpdir(), 'sp-gutter-shot-'));
const build = (entry, format, outfile) => {
  execFileSync(
    'pnpm',
    [
      'exec',
      'esbuild',
      entry,
      '--bundle',
      `--format=${format}`,
      format === 'esm' && entry.includes('crossing-probe')
        ? '--platform=node'
        : '--target=chrome120',
      `--outfile=${outfile}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit' },
  );
  return outfile;
};

const probe = await import(
  pathToFileURL(build('scripts/crossing-probe.ts', 'esm', join(out, 'probe.mjs'))).href
);
const bench = build('scripts/gutter-pitch-bench.ts', 'esm', join(out, 'bench.mjs'));
const tokens = readFileSync('src/styles/globals.css', 'utf8');

const { scene, focusLane } = probe.sceneForShot(FIXTURE, ROLL_UP);
// The whole plan, so the figures describe the diagram rather than whatever one viewport shows.
const reading = probe.gutterReadingFor(
  scene,
  { pxPerDay: 12, originX: 40, originY: 32 },
  { width: 20000, height: 145 * 28 + 200 },
);

const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
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
await page.addScriptTag({ path: bench, type: 'module' });
await page.evaluate(
  ({ scene: s, width, height, dpr, lane }) => {
    const canvas = globalThis.document.getElementById('c');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    return globalThis.renderGutterSample({
      canvas,
      root: globalThis.document.getElementById('host'),
      scene: s,
      focusLane: lane,
      pxPerDay: 12,
      size: { width, height },
      dpr,
    });
  },
  { scene, width: WIDTH, height: HEIGHT, dpr: DPR, lane: focusLane },
);
/**
 * **The filename carries the pitch, because this harness is run twice by design.**
 *
 * FC-L3 is read once at M1's geometry (a progress reading) and once at M3's (the epic's verdict),
 * and both pictures are cited. A fixed name silently replaces the first with the second: the
 * document goes on saying "at today's 28/18 geometry" above an image of a 52 px row, and nothing
 * fails. Re-running this at an unchanged pitch still overwrites its own file, which is what a
 * re-shoot should do.
 */
const file = `docs/specs/logic-legibility/gutter-channels-${String(reading.laneHeight)}.png`;
await page.screenshot({ path: join('../..', file) });
await page.close();
await browser.close();

console.log(`\n[logic-legibility M1-T4 / FC-L3] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log(
  `  busiest gutter is lane ${String(focusLane)}, framed at ${String(WIDTH)}x${String(HEIGHT)}, 12 px/day`,
);
console.log(
  `  ${String(reading.gutterLegs)} gutter legs, ${String(reading.legsTouchingABar)} touching a bar, ` +
    `peak overlap ${String(reading.peakGutterOverlap)} over ${String(reading.channels)} channels, ` +
    `max overlapping on one y ${String(reading.maxOverlappingOnOneY)}`,
);
console.log(`  -> ${file}\n`);
