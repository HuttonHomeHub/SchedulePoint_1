/**
 * **Condition 2 of `docs/specs/stacked-resource-histogram/feature-spec.md` §3 — legibility at
 * 72 px.** Committed BEFORE anything was built, and this script honours its wording rather than
 * restating it loosely.
 *
 * Usage: `node scripts/measure-strip-legibility.mjs`
 *
 * The condition is deliberately **a judgement made once against a screenshot**, not a threshold on
 * a computed value — "can a planner read this?" has no arithmetic form, and inventing one would be
 * a number tuned to the answer wearing a gate's clothes. So this script produces the artefact and
 * the arithmetic that bounds it, and a person makes the call:
 *
 * - `strip-legibility.png` — the strip band at TRUE size (1646 CSS px, DPR 1.75, 72 px), painted by
 *   the real `paintResourceStrip` against a real Chromium 2D context, with the real
 *   `categoricalCycleResolved` / `resolveResourceStripPalette` reading the real `globals.css`
 *   tokens. Nothing here is a hex literal standing in for a token.
 * - the per-segment pixel heights in the **peak** visible bucket and the **median** visible one,
 *   because the condition's concrete half is "no shown segment renders at 0 px", and the median
 *   column is where a skewed profile is worst.
 *
 * **The profile is skewed, not even.** The spec labels the draft's "eight segments over 66 px
 * averages ~8 px each" as wrong in its premise: real trade loading has a dominant trade and a tail,
 * so named segments land at 1–3 px in a peak column and worse off-peak. The generator gives the
 * first segment roughly half the load and halves from there.
 *
 * **It runs at the SHIPPED cap.** Condition 1 failed and its remedy — lower the strip's cap — was
 * applied, so the strip shows `STRIP_STACK_CAP` named bands plus the aggregate. Running this at the
 * cap the criterion was originally framed against would be quietly grading an easier fixture.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

/** The product owner's Surface Pro: 2880x1920 at 175 % = 1646 CSS px, DPR ~1.75. */
const WIDTH = 1646;
const DPR = 1.75;
/** `RESOURCE_STRIP_HEIGHT` — the band the strip is given. */
const BAND_HEIGHT = 72;
/** A two-year programme at weekly buckets. */
const BUCKETS = 104;
/** The Week preset at 1646 px: roughly a quarter of the programme on screen. */
const PX_PER_DAY = 18;

/** `STRIP_STACK_CAP` named bands plus the aggregate — read from the source, never restated. */
const capSource = readFileSync('src/features/resources/model/stack-series.ts', 'utf8');
const capMatch = /STRIP_STACK_CAP\s*=\s*(\d+)/.exec(capSource);
if (!capMatch) throw new Error('STRIP_STACK_CAP not found — the harness must not guess it');
/**
 * `STRIP_LEGIBILITY_CAP` overrides it for the remedy sweep ONLY. The default is always the shipped
 * value, so a run with no environment set cannot quietly grade an easier fixture than the one that
 * ships — which is the failure mode of a criterion framed against a cap that later moved.
 */
const CAP = Number(process.env.STRIP_LEGIBILITY_CAP ?? capMatch[1]);
const SEGMENTS = CAP + 1;

const out = mkdtempSync(join(tmpdir(), 'sp-strip-legibility-'));
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

const tokens = readFileSync('src/styles/globals.css', 'utf8');

const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
const page = await browser.newPage({
  viewport: { width: WIDTH, height: 400 },
  deviceScaleFactor: DPR,
});
// The real stylesheet, so the real resolvers read the real values. Tailwind's at-rules are unknown
// to the browser and ignored; the `:root` custom properties are all this needs.
await page.setContent(
  `<style>${tokens}</style>
   <style>body{margin:0;background:var(--canvas)}
     #strip{display:block;width:${WIDTH}px;height:${BAND_HEIGHT}px}
     #legend{display:flex;gap:12px;padding:10px 8px;font:12px system-ui;color:var(--foreground)}
     .sw{display:inline-block;width:14px;height:14px;margin-right:5px;vertical-align:-2px}</style>
   <canvas id="strip"></canvas><div id="legend"></div>`,
);
await page.addScriptTag({ path: bundle });

const sample = await page.evaluate(
  ({ segments, buckets, pxPerDay, width, height, dpr, even }) => {
    if (even) globalThis.__stripProbe__ = { even: true };
    const canvas = globalThis.document.getElementById('strip');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const result = globalThis.renderStripSample({
      canvas,
      segments,
      buckets,
      pxPerDay,
      width,
      height,
      dpr,
    });
    // A harness affordance, not product chrome: the strip itself carries no legend (the dialog
    // does). It is here so the reviewer can match a band to a ramp member by eye, which is exactly
    // what the condition asks them to do.
    globalThis.document.getElementById('legend').innerHTML = result.fills
      .map(
        (f, i) =>
          `<span><span class="sw" style="background:${f}"></span>${
            i === result.fills.length - 1 ? 'Other' : `Trade ${i + 1}`
          }</span>`,
      )
      .join('');
    return result;
  },
  {
    segments: SEGMENTS,
    buckets: BUCKETS,
    pxPerDay: PX_PER_DAY,
    width: WIDTH,
    height: BAND_HEIGHT,
    dpr: DPR,
    even: process.env.STRIP_LEGIBILITY_EVEN === '1',
  },
);

const suffix =
  (process.env.STRIP_LEGIBILITY_CAP ? `-cap${String(CAP)}` : '') +
  (process.env.STRIP_LEGIBILITY_EVEN === '1' ? '-even' : '');
const shot = `docs/specs/stacked-resource-histogram/strip-legibility${suffix}.png`;
await page.screenshot({
  path: join('../..', shot),
  clip: { x: 0, y: 0, width: WIDTH, height: 118 },
});
await browser.close();

const fmt = (xs) => xs.map((h) => h.toFixed(2).padStart(6)).join(' ');
const zeroish = (xs) => xs.filter((h) => h < 1).length;

console.log('');
console.log('Condition 2 — legibility at 72 px');
console.log(
  `  ${WIDTH} CSS px, DPR ${DPR}, band ${BAND_HEIGHT} px, Week preset (${PX_PER_DAY} px/day)`,
);
console.log(
  `  ${sample.segmentCount} segments (${sample.segmentCount - 1} named + aggregate), bar area ${sample.barArea} px`,
);
console.log(`  ${sample.visibleBuckets} of ${BUCKETS} buckets visible`);
console.log('');
console.log(`  peak bucket   #${sample.peakBucket}: ${fmt(sample.peakHeights)}`);
console.log(`  median bucket #${sample.medianBucket}: ${fmt(sample.medianHeights)}`);
console.log('');
console.log(
  `  segments under 1 px — peak ${zeroish(sample.peakHeights)}, median ${zeroish(sample.medianHeights)}`,
);
console.log(`  screenshot: ${shot}`);
console.log('');
console.log('  The arithmetic bounds the judgement; it does not make it. Look at the screenshot.');
