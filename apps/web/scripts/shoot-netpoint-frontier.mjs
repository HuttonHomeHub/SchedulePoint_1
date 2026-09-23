#!/usr/bin/env node
/**
 * **The FC-N10 frontier, photographed** (NetPoint-layout M0-T4, CQ-1).
 *
 *   node scripts/shoot-netpoint-frontier.mjs
 *
 * CQ-1 is the product owner's decision on the pictures as well as the figures, the M-C0 precedent
 * (`shoot-layouts.mjs`). Unit 300 as Arrange packs it today, and the prototype search's result at
 * three row budgets, each painted by the real `paintScene` in Chromium at **pitch 60**, the approved
 * row (the pitch is substituted in BOTH bundles, since the picture is the painter's and the layout's
 * rows are the search's). Every image is tall enough to show every row, so a budget that spends rows
 * shows them rather than cropping them off.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const PITCH = 60;
const WIDTH = 1646;
const DPR = 1;
const PX_PER_DAY = 4;

const out = mkdtempSync(join(tmpdir(), 'sp-shoot-netpoint-'));
const build = (entry, node, outfile) => {
  execFileSync(
    'pnpm',
    [
      'exec',
      'esbuild',
      entry,
      '--bundle',
      '--format=esm',
      node ? '--platform=node' : '--target=chrome120',
      `--outfile=${outfile}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit' },
  );
  const src = readFileSync(outfile, 'utf8');
  if ((src.match(/\bvar LANE_HEIGHT = \d+;/g) ?? []).length !== 1) {
    throw new Error(`INDETERMINATE: ${entry} does not declare LANE_HEIGHT exactly once`);
  }
  writeFileSync(
    outfile,
    src.replace(/\bvar LANE_HEIGHT = \d+;/, `var LANE_HEIGHT = ${String(PITCH)};`),
  );
  return outfile;
};
const m = await import(
  pathToFileURL(build('scripts/netpoint-search.ts', true, join(out, 's.mjs'))).href
);
const bench = build('scripts/gutter-pitch-bench.ts', false, join(out, 'bench.mjs'));

const u = m.unit300Layouts(FIXTURE, { rollUpSummaries: true });
const seedRows = u.shipped.lanes;
const shots = [{ slug: 'today', label: 'Arrange today (packLanes)', layout: u.shipped }];
for (const [slug, budget] of [
  ['search-seed', seedRows],
  ['search-50', seedRows + Math.max(4, Math.ceil(0.5 * seedRows))],
  ['search-unbounded', 100_000],
]) {
  const r = m.search(u.asap, u.shipped, { budget, mode: 'exact' });
  const lanes = Math.max(...r.laneOf.values()) + 1;
  shots.push({
    slug,
    label: `search, B=${budget >= 100_000 ? '∞' : String(budget)}`,
    layout: { name: slug, laneOf: r.laneOf, lanes },
    final: r.final,
  });
}

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
m.setCounters('fast');
m.setAttribution('identity');
for (const shot of shots) {
  const height = shot.layout.lanes * PITCH + 140;
  const objective = shot.final ?? m.evaluateFull(u.asap, shot.layout).objective;
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
    ({ scene, width, h, dpr, pxPerDay }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(h * dpr);
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene,
        focusLane: 0,
        pxPerDay,
        size: { width, height: h },
        dpr,
      });
    },
    {
      scene: m.sceneFor(u.asap, shot.layout).scene,
      width: WIDTH,
      h: height,
      dpr: DPR,
      pxPerDay: PX_PER_DAY,
    },
  );
  const file = `docs/specs/netpoint-layout/frontier-${shot.slug}.png`;
  await page.screenshot({ path: join('../..', file) });
  await page.close();
  console.log(
    `  ${shot.label.padEnd(28)} ${String(shot.layout.lanes).padStart(3)} rows  occluded ${String(objective.occluded).padStart(3)}  crossings ${String(objective.crossings).padStart(4)}  ->  ${file}`,
  );
}
await browser.close();
console.log(
  `\n  ${String(WIDTH)} CSS px wide, DPR ${String(DPR)}, pitch ${String(PITCH)}, ${String(PX_PER_DAY)} px/day, lane 0 at the top.`,
);
