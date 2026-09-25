#!/usr/bin/env node
/**
 * **Links-and-labels M0-T3 — the two-way prototype, photographed for CQ-2. SCRATCH.**
 *
 *   node scripts/shoot-two-way.mjs            (from apps/web)
 *
 * For `small-17` and Unit 300 at 12 px/day, finds the split track with the most segments (the
 * `fewest-crossings` side rule, the one M0-T3 measured best) and paints a crop around it twice with
 * the real painter in Chromium: as shipped, and with `two-way-prototype.ts`'s split applied through
 * `two-way-route-frame-shim.ts`. Writes four PNGs to `docs/specs/links-and-labels/`.
 *
 * The prototype is harness-only. The arrowhead is not trimmed for the offset (M3-T2 does that), so
 * the pictures show the offset lines as today's painter would draw them and no more.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const PX_PER_DAY = 12;
const WIDTH = 560;
const HEIGHT = 300;
const DPR = 2;
const here = process.cwd();
const out = mkdtempSync(join(tmpdir(), 'sp-two-way-shot-'));

// Node side: the fixtures, the frame's lines and the split, to find where to point the camera.
const nodeEntry = join(out, 'node-entry.ts');
writeFileSync(
  nodeEntry,
  `export { fixtures } from ${JSON.stringify(`${here}/scripts/attachment-probe.ts`)};
export { splitTwoWayTracks } from ${JSON.stringify(`${here}/scripts/two-way-prototype.ts`)};
export { routeFrame } from ${JSON.stringify(`${here}/src/features/tsld/render/route-frame.ts`)};
`,
);
await build({
  entryPoints: [nodeEntry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(out, 'node.mjs'),
  logLevel: 'warning',
});
const probe = await import(pathToFileURL(join(out, 'node.mjs')).href);

// Browser side: the real painter, with `./route-frame` redirected to the shim.
const shim = resolve('scripts/two-way-route-frame-shim.ts');
await build({
  entryPoints: [resolve('scripts/two-way-shot-bench.ts')],
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outfile: join(out, 'bench.mjs'),
  logLevel: 'warning',
  plugins: [
    {
      name: 'two-way-shim',
      setup(b) {
        b.onResolve({ filter: /route-frame$/ }, (args) =>
          args.importer === shim ? undefined : { path: shim },
        );
      },
    },
  ],
});
const tokens = readFileSync('src/styles/globals.css', 'utf8');
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();
const browser = await chromium.launch({ executablePath: chromiumPath || undefined });

const shots = [];
for (const fx of probe.fixtures(FIXTURE)) {
  if (fx.name !== 'small-17' && fx.name !== 'Unit 300') continue;
  const base = { pxPerDay: PX_PER_DAY, originX: 40, originY: 32 };
  const byId = new Map(fx.scene.activities.map((a) => [a.id, a]));
  // The M0 prototype's pictures, taken before the router read text: routed text-blind, as they were.
  const frame = probe.routeFrame(fx.scene, base, new Set(byId.keys()), byId, new Map(), null);
  const split = probe.splitTwoWayTracks(
    fx.scene,
    base,
    frame.lines,
    frame.workingWalk,
    4,
    'fewest-crossings',
  );
  const worst = [...split.clusters].sort((a, b) => b.segments - a.segments || a.x - b.x)[0];
  if (!worst) throw new Error(`${fx.name}: no split track to photograph`);
  const view = {
    pxPerDay: PX_PER_DAY,
    originX: base.originX - (worst.x - WIDTH / 2),
    originY: base.originY - ((worst.lo + worst.hi) / 2 - HEIGHT / 2),
  };
  for (const prototype of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: DPR,
    });
    await page.setContent(
      `<style>${tokens}</style>
       <style>body{margin:0}#host{background:var(--canvas)}
         #c{display:block;width:${WIDTH}px;height:${HEIGHT}px}</style>
       <div id="host" data-surface="canvas"><canvas id="c"></canvas></div>`,
    );
    await page.addScriptTag({ path: join(out, 'bench.mjs'), type: 'module' });
    await page.evaluate(
      ({ scene, view: v, width, height, dpr, prototype: p }) => {
        const canvas = globalThis.document.getElementById('c');
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        globalThis.renderTwoWay({
          canvas,
          root: globalThis.document.getElementById('host'),
          scene,
          view: v,
          size: { width, height },
          dpr,
          prototype: p,
        });
      },
      { scene: fx.scene, view, width: WIDTH, height: HEIGHT, dpr: DPR, prototype },
    );
    const slug = fx.name === 'Unit 300' ? 'unit300' : 'small17';
    const file = `docs/specs/links-and-labels/m0-two-way-${slug}-${prototype ? 'split' : 'shipped'}.png`;
    await page.screenshot({ path: join('../..', file) });
    await page.close();
    shots.push({ fixture: fx.name, track: worst, prototype, file });
  }
}
await browser.close();
console.log(`\n[links-and-labels M0-T3] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
for (const s of shots) {
  console.log(
    `  ${s.fixture.padEnd(9)} track x=${s.track.x.toFixed(1)} y ${s.track.lo.toFixed(0)}–${s.track.hi.toFixed(0)}` +
      ` (${s.track.segments} segments) ${s.prototype ? 'split  ' : 'shipped'} -> ${s.file}`,
  );
}
