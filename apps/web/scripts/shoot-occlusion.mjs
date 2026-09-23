#!/usr/bin/env node
/**
 * **logic-legibility M0-T5 — the occlusion cluster, photographed** (FC-L0's calibration).
 *
 *   node scripts/shoot-occlusion.mjs
 *
 * M0 measured `occl/link` at 0.559 on Unit 300 and 0.483 on a seventeen-activity extension, and
 * **neither number tells a reader what it looks like.** This epic exists because a diagram that
 * satisfied every number Part C could produce was still hard to read, so every milestone after this
 * one is judged against a picture as well as a figure.
 *
 * Painted by the real `paintScene` against a real Chromium 2D context, with the real
 * `resolveTsldPalette` reading the real `globals.css` tokens through ADR-0102's canvas surface
 * scope. **No hex literal stands in for a token** — ADR-0102's finding was that the painter had
 * never once used the canvas scope, and a harness that resolved its own colours could not have
 * found it.
 *
 * ## The frame is measured, not chosen
 *
 * A picture of a quiet area shows a case nobody complained about. The focus lane is
 * `worstOcclusionLane` — the lane carrying the most incidents where a link crosses a bar that is
 * not its own — and the count is printed beside the file name, so a reader can see what was framed
 * rather than take it on trust.
 *
 * ## Two plans, because the complaint was about both sizes
 *
 * Unit 300 band-off is the plan every Part C figure was taken on. The small extension is the size
 * the product owner's words were about — _"even for a simple plan"_ — and Part A §0.4 recorded that
 * every canvas shot in this repository uses a six-activity seed, so **that condition has never been
 * photographed at all**.
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
const HEIGHT = 820;
const DPR = 1.75;
/** Zoomed IN, which is how a planner reads logic — and the framing the complaint is about. */
const PX_PER_DAY = 12;
const ORIGIN_Y = 32;

const out = mkdtempSync(join(tmpdir(), 'sp-occl-shot-'));
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

const unit300 = probe.unit300Layouts(FIXTURE, ROLL_UP);
const small = probe.smallPlanLayouts();

/** Each subject: its scene, and the lane its worst occlusion cluster sits in. */
const subjects = [
  { slug: 'occlusion-unit-300', label: 'Unit 300, band off', ...unit300 },
  { slug: 'occlusion-small-plan', label: 'the small extension', ...small },
].map((s) => {
  const { scene } = probe.sceneFor(s.asap, s.shipped);
  const r = probe.readBoth(s.asap, s.shipped, PX_PER_DAY, ORIGIN_Y);
  const worst = probe.worstOcclusionLane(
    scene,
    { pxPerDay: PX_PER_DAY, originX: 40, originY: ORIGIN_Y },
    // The WHOLE plan, so the cluster is chosen over everything rather than over what one viewport
    // happens to show — the culling trap M0-T2's pan sweep ran into, one question along.
    { width: 20000, height: Math.max(s.shipped.lanes, 145) * 28 + 200 },
  );
  return { ...s, scene, reading: r, worst };
});

const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

console.log(`\n[logic-legibility M0-T5] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}\n`);

const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
for (const s of subjects) {
  if (s.worst.incidents === 0) {
    throw new Error(
      `${s.label} has no foreign occlusion at all, so there is no cluster to photograph. ` +
        `Refusing to produce a picture that would look like an answer.`,
    );
  }
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
    ({ scene, width, height, dpr, pxPerDay, focusLane, originX }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene,
        focusLane,
        pxPerDay,
        size: { width, height },
        dpr,
        originX,
      });
    },
    {
      scene: s.scene,
      width: WIDTH,
      height: HEIGHT,
      dpr: DPR,
      pxPerDay: PX_PER_DAY,
      focusLane: s.worst.lane,
      // Put the cluster about a third of the way across, so what surrounds it is visible too.
      originX: Math.min(40, Math.round(WIDTH / 3 - s.worst.x + 40)),
    },
  );
  const file = `docs/specs/logic-legibility/${s.slug}.png`;
  await page.screenshot({ path: join('../..', file) });
  await page.close();
  console.log(
    `  ${s.label.padEnd(22)} ${String(s.shipped.lanes).padStart(3)} rows, ` +
      `occl/link ${(s.reading.foreignLinks / s.reading.visibleLinks).toFixed(3)}, ` +
      `worst lane ${String(s.worst.lane)} (${String(s.worst.incidents)} incidents)  ->  ${file}`,
  );
}
await browser.close();
console.log(
  `\n  ${String(WIDTH)} CSS px x ${String(HEIGHT)}, DPR ${String(DPR)}, ${String(PX_PER_DAY)} px/day,` +
    ` each framed on its own worst occlusion lane.\n`,
);
