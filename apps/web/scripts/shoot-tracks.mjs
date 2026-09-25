#!/usr/bin/env node
/**
 * **Links-and-labels M3 — the two-way tracks, photographed.**
 *
 *   node scripts/shoot-tracks.mjs            (from apps/web)
 *
 * For `small-17` and Unit 300 at 12 px/day, finds the track the shipped pass split with the most
 * moved segments and paints a crop around it twice with the real painter in Chromium: with the pass
 * switched off (the frame as before M3) and as shipped. Writes four PNGs to
 * `docs/specs/links-and-labels/`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
// Per fixture: small-17 at 12 px/day in a 560 × 300 crop; Unit 300 at 4 px/day in a 1646 × 900
// one. The painter routes only the activities in its view, so a small crop of Unit 300 leaves out
// what makes its tracks residue, and the pass then has nothing to split there.
const FRAMES = { 'small-17': [12, 560, 300], 'Unit 300': [4, 1646, 900] };
const DPR = 2;
const here = process.cwd();
const out = mkdtempSync(join(tmpdir(), 'sp-tracks-shot-'));

// Node side: the fixtures and the shipped frame, to find where to point the camera.
const nodeEntry = join(out, 'node-entry.ts');
writeFileSync(
  nodeEntry,
  `export { fixtures, moduleLayout } from ${JSON.stringify(`${here}/scripts/attachment-probe.ts`)};
export { routeFrame } from ${JSON.stringify(`${here}/src/features/tsld/render/route-frame.ts`)};
export { PORT_OFFSET_PX } from ${JSON.stringify(`${here}/src/features/tsld/render/link-tracks.ts`)};
export { allItems } from ${JSON.stringify(`${here}/src/features/tsld/render/row-text-layout.ts`)};
export { textIndexOf } from ${JSON.stringify(`${here}/src/features/tsld/render/text-index.ts`)};
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

// Browser side: the real painter, with `link-tracks` redirected to the switchable shim.
const shim = resolve('scripts/shoot-tracks-shim.ts');
await build({
  entryPoints: [resolve('scripts/shoot-tracks-bench.ts')],
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outfile: join(out, 'bench.mjs'),
  logLevel: 'warning',
  plugins: [
    {
      name: 'tracks-shim',
      setup(b) {
        b.onResolve({ filter: /link-tracks$/ }, (args) =>
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
  const shape = FRAMES[fx.name];
  if (!shape) continue;
  const [PX_PER_DAY, WIDTH, HEIGHT] = shape;
  const base = { pxPerDay: PX_PER_DAY, originX: 40, originY: 32 };
  const byId = new Map(fx.scene.activities.map((a) => [a.id, a]));
  const text = probe.textIndexOf(
    probe.allItems(probe.moduleLayout(fx.scene, base, { width: 4000, height: 3000 })),
  );
  const frame = probe.routeFrame(fx.scene, base, new Set(byId.keys()), byId, new Map(), text);
  // The split track with the most moved segments: its x, and the y-range of the lines either side.
  const tracks = (frame.tracks?.splitAt ?? []).map((x) => {
    const spans = [...frame.lines.values()].flatMap((line) =>
      line.slice(1).flatMap((q, i) => {
        const p = line[i];
        const side = Math.abs(Math.abs(p.x - x) - probe.PORT_OFFSET_PX) < 0.01;
        return side && Math.abs(p.x - q.x) < 1e-6 ? [[Math.min(p.y, q.y), Math.max(p.y, q.y)]] : [];
      }),
    );
    return {
      x,
      segments: spans.length,
      lo: Math.min(...spans.map((s) => s[0])),
      hi: Math.max(...spans.map((s) => s[1])),
    };
  });
  const worst = tracks.sort((a, b) => b.segments - a.segments || a.x - b.x)[0];
  if (!worst) throw new Error(`${fx.name}: no split track to photograph`);
  const view = {
    pxPerDay: PX_PER_DAY,
    originX: base.originX - (worst.x - WIDTH / 2),
    originY: base.originY - ((worst.lo + worst.hi) / 2 - HEIGHT / 2),
  };
  for (const split of [false, true]) {
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
      ({ scene, view: v, width, height, dpr, split: p }) => {
        const canvas = globalThis.document.getElementById('c');
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        globalThis.renderTracks({
          canvas,
          root: globalThis.document.getElementById('host'),
          scene,
          view: v,
          size: { width, height },
          dpr,
          split: p,
        });
      },
      { scene: fx.scene, view, width: WIDTH, height: HEIGHT, dpr: DPR, split },
    );
    const slug = fx.name === 'Unit 300' ? 'unit300' : 'small17';
    const file = `docs/specs/links-and-labels/m3-tracks-${slug}-${split ? 'after' : 'before'}.png`;
    await page.screenshot({ path: join('../..', file) });
    await page.close();
    shots.push({ fixture: fx.name, track: worst, split, file });
  }
}
await browser.close();
console.log(`\n[links-and-labels M3] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
for (const s of shots) {
  console.log(
    `  ${s.fixture.padEnd(9)} track x=${s.track.x.toFixed(1)} y ${s.track.lo.toFixed(0)}–${s.track.hi.toFixed(0)}` +
      ` (${s.track.segments} segments) ${s.split ? 'after ' : 'before'} -> ${s.file}`,
  );
}
