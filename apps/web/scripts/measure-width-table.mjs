#!/usr/bin/env node
/**
 * **Links-and-labels M0-T4 — the width table's contents, size and build time.**
 *
 *   node scripts/measure-width-table.mjs            (from apps/web)
 *
 * 1. For each scene (`small-17`, the reference plan, Unit 300 with its real P6 names, and the
 *    300-activity generated plan with its own names), paints it through `width-table-probe.ts`'s
 *    recorder at zooms {1, 2, 4, 8, 12, 24} px/day, canvas widths {800, 1646, 4000}, the scene's
 *    own lanes plus three seeded lane shuffles, and three toggle sets (default, centre item on,
 *    activity codes on). Every key the text layers ask the `labelWidths` memo for is classified
 *    against spec §4.4's predicted set. A `miss` is printed with its text and fails the run.
 * 2. Times building the predicted table (default toggles) in Chromium, through the real
 *    `labelWidths` memo and a real 2D context, with IBM Plex Sans loaded from the repo's own woff2.
 *    Median of 7 cold builds (the memo is cleared before each).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const here = process.cwd();
const out = mkdtempSync(join(tmpdir(), 'sp-width-table-'));
const entry = join(out, 'entry.ts');
writeFileSync(
  entry,
  `export * from ${JSON.stringify(`${here}/scripts/width-table-probe.ts`)};
export { fixtures } from ${JSON.stringify(`${here}/scripts/attachment-probe.ts`)};
export { scaleScene } from ${JSON.stringify(`${here}/src/features/perf-probe/scenes/scale-scene.ts`)};
`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(out, 'probe.mjs'),
  logLevel: 'warning',
});
const probe = await import(pathToFileURL(join(out, 'probe.mjs')).href);

// Seeded shuffle of lane indices (mulberry32), so the lane layouts are reproducible.
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffledLanes = (scene, seed) => {
  const next = rng(seed);
  const lanes = [...new Set(scene.activities.map((a) => a.laneIndex))];
  const perm = [...lanes];
  for (let i = perm.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const map = new Map(lanes.map((l, i) => [l, perm[i]]));
  return {
    ...scene,
    activities: scene.activities.map((a) => ({ ...a, laneIndex: map.get(a.laneIndex) })),
  };
};

const names = probe.unit300Names(FIXTURE);
// small-17 keeps its keys as labels (it has no names); the others carry their real names.
const scale = probe.scaleScene(300);
const scenes = [];
for (const fx of probe.fixtures(FIXTURE)) {
  if (fx.name === 'brief') continue;
  scenes.push({
    name: fx.name,
    scene:
      fx.name === 'Unit 300'
        ? probe.withNames(fx.scene, names)
        : probe.withNames(
            fx.scene,
            fx.name === 'reference-netpoint' ? probe.referenceNames() : new Map(),
          ),
  });
}
scenes.push({
  name: 'scale-300',
  scene: {
    ...scale,
    view: { ...probe.DEFAULT_VIEW_TOGGLES },
    dataDate: scale.dataDate ?? '2026-01-05',
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
  },
});

const toggleSets = {
  default: { ...probe.DEFAULT_VIEW_TOGGLES },
  centre: { ...probe.DEFAULT_VIEW_TOGGLES, centreItem: true },
  codes: { ...probe.DEFAULT_VIEW_TOGGLES, activityCodes: true },
};
let misses = 0;
const tables = [];
for (const { name, scene: base } of scenes) {
  const lanes = Math.max(...base.activities.map((a) => a.laneIndex)) + 1;
  for (const [tname, toggles] of Object.entries(toggleSets)) {
    const scene0 = { ...base, view: toggles };
    const predicted = probe.predictedTable(scene0, toggles);
    const recorded = new Set();
    for (const layout of [
      scene0,
      shuffledLanes(scene0, 1),
      shuffledLanes(scene0, 2),
      shuffledLanes(scene0, 3),
    ]) {
      for (const pxPerDay of [1, 2, 4, 8, 12, 24]) {
        for (const width of [800, 1646, 4000]) {
          probe.recordKeys(
            layout,
            { pxPerDay, originX: 40, originY: 32 },
            { width, height: lanes * 60 + 200 },
            recorded,
          );
        }
      }
    }
    const byClass = {};
    const missed = [];
    for (const k of recorded) {
      const c = probe.classify(k, predicted, scene0, toggles);
      byClass[c] = (byClass[c] ?? 0) + 1;
      if (c === 'miss') missed.push(k.replace('\u0000', ' | '));
    }
    misses += missed.length;
    const labelChars = scene0.activities.reduce((n, a) => n + a.label.length, 0);
    console.log(
      `${name.padEnd(20)} ${tname.padEnd(8)} activities ${String(scene0.activities.length).padStart(4)}  ` +
        `Σ label ${String(labelChars).padStart(6)}  predicted ${String(predicted.size).padStart(6)}  ` +
        `recorded ${String(recorded.size).padStart(5)}  ${JSON.stringify(byClass)}`,
    );
    for (const m of missed.slice(0, 10)) console.log(`    MISS ${JSON.stringify(m)}`);
    if (tname === 'default') tables.push({ name, keys: [...predicted] });
  }
}

// Build time in Chromium, through the real memo, with the product's face loaded.
const bench = join(out, 'bench.mjs');
const benchEntry = join(out, 'bench.ts');
writeFileSync(
  benchEntry,
  `import { labelWidths } from ${JSON.stringify(`${here}/src/features/tsld/render/layers/text-measure.ts`)};
import { LABEL_FONT } from ${JSON.stringify(`${here}/src/features/tsld/render/geometry.ts`)};
globalThis.buildTable = (keys) => {
  const ctx = document.createElement('canvas').getContext('2d');
  const times = [];
  for (let run = 0; run < 7; run += 1) {
    labelWidths.clear();
    const t0 = performance.now();
    for (const key of keys) {
      const [a, b] = key.split('\\u0000');
      const font = b === undefined ? undefined : a;
      const text = b ?? a;
      ctx.font = font ?? LABEL_FONT;
      labelWidths.measure(text, (t) => ctx.measureText(t).width, font);
    }
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  return { median: times[3], min: times[0], max: times[6], size: labelWidths.size };
};
`,
);
await build({
  entryPoints: [benchEntry],
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outfile: bench,
  logLevel: 'warning',
});
const font = readFileSync('src/assets/fonts/ibm-plex-sans-latin.woff2').toString('base64');
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();
const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
console.log('\nBuild time in Chromium (default toggles, cold memo, median of 7):');
for (const t of tables) {
  const page = await browser.newPage();
  await page.setContent(
    `<style>@font-face{font-family:'IBM Plex Sans';font-weight:400 700;src:url(data:font/woff2;base64,${font}) format('woff2')}</style><p style="font-family:'IBM Plex Sans'">x</p>`,
  );
  await page.addScriptTag({ path: bench, type: 'module' });
  const loaded = await page.evaluate(async () => {
    await globalThis.document.fonts.load("11px 'IBM Plex Sans'");
    await globalThis.document.fonts.load("600 11px 'IBM Plex Sans'");
    return globalThis.document.fonts.check("11px 'IBM Plex Sans'");
  });
  if (!loaded) throw new Error('IBM Plex Sans did not load; the timing would be the fallback face');
  const r = await page.evaluate((keys) => globalThis.buildTable(keys), t.keys);
  const bytes = JSON.stringify(t.keys.map((k) => [k, 123.456])).length;
  console.log(
    `  ${t.name.padEnd(20)} ${String(t.keys.length).padStart(6)} keys  ~${(bytes / 1024).toFixed(0)} kB as [key, width][]  ` +
      `build ${r.median.toFixed(2)} ms (min ${r.min.toFixed(2)}, max ${r.max.toFixed(2)})`,
  );
  await page.close();
}
await browser.close();
if (misses > 0) {
  console.log(`\n${misses} keys outside the predicted set: spec §4.4 is incomplete`);
  process.exit(1);
}
