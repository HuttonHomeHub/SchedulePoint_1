#!/usr/bin/env node
/**
 * **Re-layout's layouts, photographed** (FC-R5's pictures, plan M0-T5).
 *
 *   node scripts/shoot-relayout.mjs --report=.tmp/relayout/relayout-<sha>.json \
 *     --plan=fixture-p6-torture-v1 --out=../../docs/specs/relayout-quality/pictures
 *
 * FC-R5 asks whether a lever "spreads the plan out", which no figure answers for a reader: the owner's
 * 2026-09-23 objection was to what the diagram LOOKS like. This paints the same plan three ways — the
 * hand layout as seeded, today's Re-layout, and the report's candidate — with the real `paintScene`
 * in a real Chromium, framed identically (the whole plan, lane 0 at the top), so only the lane
 * assignment differs. Needs no servers and no database: the scene is the committed corpus and the
 * lanes are the ones the report recorded.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const reportPath = opt('report', null);
const planName = opt('plan', null);
if (reportPath === null || planName === null)
  throw new Error('usage: shoot-relayout.mjs --report=<json> --plan=<seedName> [--out=<dir>]');
const outDir = resolve(opt('out', '../../docs/specs/relayout-quality/pictures'));
mkdirSync(outDir, { recursive: true });

const WIDTH = 1646;
const DPR = 1;
const MARGIN = 40;

const corpus = JSON.parse(readFileSync('scripts/fixtures/relayout-corpus.json', 'utf8'));
const plan = corpus.plans.find((p) => p.seedName === planName);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const result = report.results.find((r) => r.seedName === planName);
if (plan === undefined || result === undefined) throw new Error(`no plan ${planName}`);

const laneHeight = Number(
  /export const LANE_HEIGHT = (\d+)/.exec(
    readFileSync('src/features/tsld/render/geometry.ts', 'utf8'),
  )?.[1],
);
const DAY_MS = 86_400_000;
const days = (iso) => Math.round((Date.parse(iso) - Date.parse(plan.dataDate)) / DAY_MS);
const drawn = plan.activities.filter((a) => a.drawnStart !== null);
const first = Math.min(...drawn.map((a) => days(a.drawnStart)));
const last = Math.max(...drawn.map((a) => days(a.drawnFinish ?? a.drawnStart)));
const pxPerDay = (WIDTH - 2 * MARGIN) / (last - first + 1);

const layouts = [
  ['hand', new Map(plan.activities.map((a) => [a.id, a.laneIndex]))],
  ['today', new Map(result.today.lanes)],
  ['candidate', new Map(result.product.lanes)],
];

const tmp = mkdtempSync(join(tmpdir(), 'sp-shoot-relayout-'));
const bench = join(tmp, 'bench.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/gutter-pitch-bench.ts',
    '--bundle',
    '--format=esm',
    '--target=chrome120',
    `--outfile=${bench}`,
    '--log-level=warning',
    '--define:import.meta.env={}',
  ],
  { stdio: 'inherit' },
);
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
for (const [name, lanes] of layouts) {
  const rows = Math.max(...lanes.values()) + 1;
  const height = Math.round(rows * laneHeight + 2 * MARGIN);
  const scene = {
    activities: plan.activities.map((a) => ({ ...a, laneIndex: lanes.get(a.id) ?? a.laneIndex })),
    edges: plan.edges,
    dataDate: plan.dataDate,
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
  };
  const page = await browser.newPage({
    viewport: { width: WIDTH, height },
    deviceScaleFactor: DPR,
  });
  await page.setContent(
    `<style>${tokens}</style>
     <style>body{margin:0}#host{background:var(--canvas)}
       #c{display:block;width:${String(WIDTH)}px;height:${String(height)}px}</style>
     <div id="host" data-surface="canvas"><canvas id="c"></canvas></div>`,
  );
  await page.addScriptTag({ path: bench, type: 'module' });
  await page.evaluate(
    ({ s, width, h, dpr, ppd, originX }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(h * dpr);
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene: s,
        focusLane: 0,
        pxPerDay: ppd,
        size: { width, height: h },
        dpr,
        originX,
      });
    },
    {
      s: scene,
      width: WIDTH,
      h: height,
      dpr: DPR,
      ppd: pxPerDay,
      originX: MARGIN - first * pxPerDay,
    },
  );
  const file = join(outDir, `${planName}-${name}.png`);
  await page.screenshot({ path: file });
  await page.close();
  console.log(`${name.padEnd(10)} ${String(rows).padStart(3)} rows -> ${file}`);
}
await browser.close();
