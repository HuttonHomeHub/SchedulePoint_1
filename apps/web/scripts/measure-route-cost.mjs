#!/usr/bin/env node
/**
 * **Node-to-node links M0-T3 — what does routing cost?** (FC-T8 (b) and (d))
 *
 *   node scripts/measure-route-cost.mjs            (from apps/web)
 *
 * Two readings, each taken twice so the run-to-run spread sits beside the number (ADR-0128: a
 * machine whose own no-change spread exceeds the bar cannot answer, and the reading says so).
 *
 * - **(b) `routeFrame` in Chromium** at `scale-2000`, Week framing (14 px/day, a 1920x1080 view at
 *   the plan's start), over the bars that view draws — the painter's own cull, reproduced as
 *   `activityRect ∩ viewport`, which is the same test `paint.ts` makes. Headless: the number is the
 *   routing arithmetic, which is CPU work with no rasterisation in it, so the software-rasteriser
 *   caveat `measure-link-routing.mjs` carries does not apply to it. p50 and p95 over 200 frames after
 *   30 warm-up frames, the cull done before the clock starts.
 * - **(d) Tidy on Unit 300**, `optimiseLayout` with its default caps, in node. The product runs it
 *   in a Web Worker (ADR-0152); a worker runs the same JavaScript on the same engine, so this is
 *   the worker's work without the message hop. Stated rather than hidden: it is a proxy for the
 *   worker, not a reading of it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const cwd = process.cwd();
const out = mkdtempSync(join(tmpdir(), 'sp-route-cost-'));

const build = (entry, outfile, platform) => {
  execFileSync(
    'pnpm',
    [
      'exec',
      'esbuild',
      entry,
      '--bundle',
      '--format=esm',
      `--platform=${platform}`,
      `--outfile=${outfile}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit' },
  );
  return outfile;
};

// ── (b) routeFrame in Chromium ───────────────────────────────────────────────────────────────────
const browserEntry = join(out, 'browser.ts');
writeFileSync(
  browserEntry,
  `import { scaleScene } from ${JSON.stringify(`${cwd}/src/features/perf-probe/scenes/scale-scene.ts`)};
import { routeFrame } from ${JSON.stringify(`${cwd}/src/features/tsld/render/route-frame.ts`)};
import { activityRect, rectsIntersect } from ${JSON.stringify(`${cwd}/src/features/tsld/render/geometry.ts`)};
globalThis.measure = () => {
  const s = scaleScene(2000);
  const scene = { activities: s.activities, edges: s.edges, dataDate: '2026-01-01', timeTrueLinks: true, visualRefresh: true, linkRouting: true, isWorkingDay: () => true };
  const view = { pxPerDay: 14, originX: 40, originY: 32 };
  const vp = { x: 0, y: 0, w: 1920, h: 1080 };
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const times = [];
  let visible = 0;
  let lines = 0;
  for (let i = 0; i < 230; i += 1) {
    // The cull is the painter's, done before the clock starts: this times routing, not culling.
    const cache = new Map();
    const ids = new Set();
    for (const a of s.activities) {
      const r = activityRect(a, view, scene.dataDate, cache);
      if (r && rectsIntersect(r, vp)) ids.add(a.id);
    }
    const t0 = performance.now();
    const f = routeFrame(scene, view, ids, byId, cache);
    const t = performance.now() - t0;
    if (i >= 30) times.push(t);
    visible = ids.size;
    lines = f.lines.size;
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  return { visible, lines, p50: q(0.5), p95: q(0.95) };
};
`,
);
const browserBundle = build(browserEntry, join(out, 'browser.mjs'), 'browser');
const exe = execFileSync('sh', [
  '-c',
  'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
])
  .toString()
  .trim();
const browser = await chromium.launch({ executablePath: exe || undefined });
const routeRuns = [];
for (let run = 0; run < 2; run += 1) {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: browserBundle, type: 'module' });
  await page.waitForFunction(() => typeof globalThis.measure === 'function');
  routeRuns.push(await page.evaluate(() => globalThis.measure()));
  await page.close();
}
await browser.close();

// ── (d) Tidy on Unit 300 ─────────────────────────────────────────────────────────────────────────
const nodeEntry = join(out, 'node.ts');
writeFileSync(
  nodeEntry,
  `export { optimiseLayout } from ${JSON.stringify(`${cwd}/src/features/tsld/render/optimise-layout.ts`)};
export { sceneFor, unit300Layouts } from ${JSON.stringify(`${cwd}/scripts/crossing-probe.ts`)};
`,
);
const nodeMod = await import(pathToFileURL(build(nodeEntry, join(out, 'node.mjs'), 'node')).href);
const unit = nodeMod.unit300Layouts(FIXTURE);
const { scene } = nodeMod.sceneFor(unit.asap, unit.shipped);
const tidyRuns = [];
for (let run = 0; run < 2; run += 1) {
  const t0 = performance.now();
  const result = nodeMod.optimiseLayout(scene);
  tidyRuns.push({ ms: performance.now() - t0, evaluations: result.evaluations ?? null });
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
console.log(`\n[node-to-node links / cost] ${new Date().toISOString()}  commit ${commit}`);
console.log('  (b) routeFrame, scale-2000, Week (14 px/day), 1920x1080, Chromium headless');
for (const [i, r] of routeRuns.entries()) {
  console.log(
    `      run ${i + 1}: ${r.visible} bars visible, ${r.lines} links routed, ` +
      `p50 ${r.p50.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms`,
  );
}
const p95s = routeRuns.map((r) => r.p95);
console.log(`      p95 spread ${(Math.max(...p95s) - Math.min(...p95s)).toFixed(2)} ms`);
console.log('  (d) Tidy (optimiseLayout, default caps), Unit 300, node (worker proxy)');
for (const [i, r] of tidyRuns.entries()) {
  console.log(`      run ${i + 1}: ${r.ms.toFixed(0)} ms`);
}
console.log('');
