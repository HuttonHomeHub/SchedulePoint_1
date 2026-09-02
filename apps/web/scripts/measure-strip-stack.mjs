/**
 * **M2-T5 — the committed measurement for the stacked canvas strip.**
 *
 * Usage: `node scripts/measure-strip-stack.mjs`
 *
 * The conditions below were committed in `docs/specs/stacked-resource-histogram/` BEFORE anything
 * was built, and this script honours them rather than restating them loosely:
 *
 * 1. **Paint cost at BOTH Week and Fit zoom.** Fit is where nothing is culled, and where
 *    `docs/TECH_DEBT.md` #75's real-hardware run shows the thinnest margin (8.9 ms p95 but 10.2 %
 *    of frames dropped) — so the feature's worst case and the painter's worst case coincide at a
 *    zoom a Week-only condition would never visit.
 * 2. **`paintResourceStrip`'s own timing, not the whole rAF tick.** The strip and the main scene
 *    repaint on the same tick, and the main scene's run-to-run variance would swallow a 2 ms delta.
 *    Precedent: `measure-link-routing.mjs` times `paintScene` rather than the frame.
 * 3. **DPR is pinned and reported.** 1646 CSS px is the product owner's Surface Pro, which is
 *    DPR ~1.75 — and this is a fill-rate-bound measurement, so the backing store's DPR² matters.
 *
 * **The fixture guard is the important part.** `plan:scale-500` declares exactly ONE resource, so
 * measuring against it would report a stacked chart's cost as zero — a trivially passing number
 * that says nothing about the code path being changed. This refuses to run a single-segment stack,
 * and prints the segment and visible-bucket counts with every result so a fast number can always be
 * checked against how much was actually drawn (#75's own empty-plan reading of 0.5 ms, and the
 * ADR-0066 scale generator, are both this failure).
 *
 * It deliberately does NOT drive the dev server. `reuseExistingServer` silently adopts a stale one
 * and produced three consecutive false diagnoses in ADR-0099; painting the real painter against a
 * real 2D context answers the committed question with none of that surface.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

/** The product owner's Surface Pro: 2880x1920 at 175 % = 1646 CSS px, DPR ~1.75. */
const WIDTH = 1646;
const DPR = 1.75;
/** `RESOURCE_STRIP_HEIGHT` — the band the strip is given. */
const BAND_HEIGHT = 72;
const FRAMES = 300;

/** A two-year programme at weekly buckets: 104 buckets, the shape #75's Fit case is about. */
const BUCKETS = 104;
/** Eight named bands plus the aggregate — the cap this feature ships with. */
const SEGMENTS = Number(process.env.STRIP_SEGMENTS ?? '9');

/**
 * Week: roughly a quarter on screen at 1646 px, the zoom a planner works at.
 * Fit: the whole two-year programme in the band, where NOTHING is culled.
 */
const ZOOMS = [
  ['Week', 18],
  ['Fit', WIDTH / (BUCKETS * 7)],
];

const out = mkdtempSync(join(tmpdir(), 'sp-strip-bench-'));
const bundle = join(out, 'bench.js');

execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/strip-stack-bench.ts',
    '--bundle',
    '--format=iife',
    '--target=chrome120',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: 900 },
  deviceScaleFactor: DPR,
});
await page.addScriptTag({ path: bundle });
// The two falsification probes behind `docs/TECH_DEBT.md` #226 — `EVEN=1` removes the skew,
// `DISTINCT=n` limits the palette. Both left in place so the cliff can be re-investigated.
await page.evaluate(
  (probe) => {
    globalThis.__stripProbe__ = probe;
  },
  {
    ...(process.env.EVEN === '1' ? { even: true } : {}),
    ...(process.env.DISTINCT ? { distinct: Number(process.env.DISTINCT) } : {}),
  },
);

console.log(`\nStacked resource strip — paint cost`);
console.log(`  ${WIDTH} CSS px, DPR ${DPR}, band ${BAND_HEIGHT} px, ${FRAMES} frames per run\n`);

let refused = false;
for (const [label, pxPerDay] of ZOOMS) {
  // The BASELINE is a one-segment stack — exactly what the strip drew before this epic. The
  // condition is a DELTA against it, measured in the same session, so machine noise is shared.
  const baseline = await page.evaluate((o) => globalThis.runStripBench(o), {
    segments: 1,
    buckets: BUCKETS,
    pxPerDay,
    width: WIDTH,
    height: BAND_HEIGHT,
    dpr: DPR,
    frames: FRAMES,
  });
  const stacked = await page.evaluate((o) => globalThis.runStripBench(o), {
    segments: SEGMENTS,
    buckets: BUCKETS,
    pxPerDay,
    width: WIDTH,
    height: BAND_HEIGHT,
    dpr: DPR,
    frames: FRAMES,
  });

  if (stacked.segmentCount < 2) {
    console.error(`  REFUSED at ${label}: a ${stacked.segmentCount}-segment stack is not a stack.`);
    refused = true;
    continue;
  }
  if (stacked.visibleBuckets === 0) {
    console.error(
      `  REFUSED at ${label}: nothing survived the cull, so this measures an empty band.`,
    );
    refused = true;
    continue;
  }

  const delta = stacked.p95 - baseline.p95;
  const verdict = delta <= 2.0 ? 'PASS' : 'FAIL';
  // **A p95 verdict is unstable when the slow band straddles the percentile** (`docs/TECH_DEBT.md`
  // #226). `p95` reads `times[floor(frames * 0.95)]`, so over 300 frames it is a slow frame exactly
  // when 15 or more are slow — and the slow-frame count rises SMOOTHLY with segment count (measured
  // 9, 12, 13, 14, 15, 16, 19 at 4/6/7/8/9/10/12 segments), crossing 15 at nine. That is the whole
  // of the "20x cliff" this row was raised on: the estimator, not the painter.
  const boundary = FRAMES - Math.floor(FRAMES * 0.95);
  const straddles =
    Math.abs(stacked.slowFrames - boundary) <= 2 || Math.abs(baseline.slowFrames - boundary) <= 2;
  console.log(`  ${label} (${pxPerDay.toFixed(2)} px/day)`);
  console.log(
    `    drew ${String(stacked.visibleBuckets)}/${String(stacked.bucketCount)} buckets x ${String(stacked.segmentCount)} segments`,
  );
  console.log(
    `    baseline (1 segment) p50 ${baseline.p50.toFixed(3)} ms · p95 ${baseline.p95.toFixed(3)} ms`,
  );
  console.log(
    `    stacked  (${String(SEGMENTS)} segs) p50 ${stacked.p50.toFixed(3)} ms · p95 ${stacked.p95.toFixed(3)} ms`,
  );
  console.log(
    `    delta p95 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} ms — ${verdict} (condition: <= +2.0 ms)`,
  );
  console.log(
    `    slow frames (> ${String(stacked.slowFrameMs)} ms): ${String(stacked.slowFrames)}/${String(FRAMES)} stacked, ` +
      `${String(baseline.slowFrames)}/${String(FRAMES)} baseline — p95 turns slow at ${String(boundary)}`,
  );
  console.log(
    straddles
      ? `    NOTE: a slow-frame count within 2 of the boundary means this delta is decided by the
` +
          `          ESTIMATOR, not by paint cost. Read the counts above and p50 first (#226).
`
      : '',
  );
}

await browser.close();
rmSync(out, { recursive: true, force: true });
if (refused) process.exit(2);
