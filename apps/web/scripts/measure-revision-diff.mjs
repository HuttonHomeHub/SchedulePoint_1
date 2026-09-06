#!/usr/bin/env node
/**
 * M0 Condition A — drive `revision-diff-bench.ts` in a real Chromium and judge it against the
 * conditions committed in `docs/specs/revision-compare-changes/m0-condition.md` BEFORE this file
 * existed.
 *
 *   node scripts/measure-revision-diff.mjs [--headed] [--viewport WxH] [--pairs N] [--frames N]
 *                                          [--scene scale|fixture] [--preset week|fit]
 *
 * ## The verdict throws when it has nothing to judge
 *
 * That is the one rule this file exists to obey, and it is not hypothetical. ADR-0097 Landing C's
 * harness produced a **PROCEED from an `undefined`** — an edit had silently failed to apply, and
 * `undefined >= 120` is `false`, which is the right answer from a missing number. So every gate
 * here checks that it HAS a number before comparing it, and the non-vacuity check runs FIRST: a
 * treatment that drew nothing would pass every pacing condition perfectly.
 *
 * ## `--headed` is not optional for a quotable number
 *
 * Headless Chromium can serve Canvas 2D from a software rasteriser, so a headless figure measures
 * a code path no planner runs — the caveat #75's own published numbers carry. Headless is allowed
 * here for a smoke run and the verdict says which it was.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const headed = argv.includes('--headed');

const viewportArg = flag('viewport', '1646x1080');
const viewportMatch = /^(\d+)x(\d+)$/.exec(viewportArg);
if (!viewportMatch) {
  console.error(`Bad --viewport "${viewportArg}" — expected WxH, e.g. 1646x1080.`);
  process.exit(1);
}
const viewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };

const pairs = Number(flag('pairs', '3'));
const frames = Number(flag('frames', '180'));
const scene = flag('scene', 'scale');
const preset = flag('preset', 'week');
if (scene !== 'scale' && scene !== 'fixture') {
  console.error(`Unknown --scene "${scene}" — expected "scale" or "fixture".`);
  process.exit(1);
}
if (preset !== 'week' && preset !== 'fit') {
  console.error(`Unknown --preset "${preset}" — expected "week" or "fit".`);
  process.exit(1);
}

/**
 * The non-vacuity floor, from the condition file. Counted INSIDE the viewport, because a changed
 * set that is all off-screen costs the painter nothing and would pass every gate while proving
 * nothing — the ADR-0093 shape (a green result that cannot tell "it is cheap" from "there was
 * nothing there").
 *
 * **PROPORTIONAL, and it was absolute until it met the control cell.** The committed condition said
 * >= 25 bars and >= 40 links, written with the 2,160-activity scene in mind. The 147-activity
 * control has 188 links in total, so 12 % of them can never reach 40 — the control was unrunnable
 * by construction, and the harness discovered that by THROWING rather than by reporting a pass,
 * which is the one behaviour the condition file demanded of it. The floor was not lowered to make
 * the run succeed: it was re-expressed so it asks the same question at both scene sizes. A tiny
 * absolute guard survives underneath, because 10 % of two links is not a measurement either.
 */
const MIN_CHANGED_FRACTION = 0.1;
const MIN_CHANGED_ABSOLUTE = 5;

/** P1 — the difference gate. ADR-0100's bar, taken because it is the only one in this repository
 * that has been used and passed, rather than invented for this epic. */
const MAX_DROPPED_DELTA_PP = 2.0;
/** P2 — the absolute gate. ADR-0026 §9's floor at the 2,000-activity ceiling. */
const MIN_FPS = 30;

const out = mkdtempSync(join(tmpdir(), 'sp-revdiff-'));
const bundle = join(out, 'bench.js');

// The esbuild CLI rather than its JS API, for the reason `measure-link-routing.mjs` records:
// esbuild is a transitive dependency of Vite here, not a direct one, so this file cannot import it.
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/revision-diff-bench.ts',
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

let browser;
try {
  browser = await chromium.launch({
    headless: !headed,
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  });
} catch (error) {
  if (!headed) throw error;
  console.error(
    '\nCould not launch a HEADED Chromium — this machine appears to have no display.\n' +
      'Expected on a server or in a container. Either run it on a machine with a display,\n' +
      "or drop --headed and read the verdict's own caveat about software rasterisation.\n",
  );
  process.exit(1);
}

const pct = (n) => `${n.toFixed(2)} pp`;
const ms = (n) => `${n.toFixed(2)} ms`;

try {
  const page = await browser.newPage({ viewport });
  await page.setContent('<!doctype html><body style="margin:0"></body>');
  await page.addScriptTag({ path: bundle });

  const result = await page.evaluate(
    // eslint-disable-next-line no-undef
    (o) => window.__benchRevisionDiff(o),
    { scene, preset, frames, pairs },
  );

  console.log('');
  console.log('M0 Condition A — tier 2 paint cost');
  console.log(`  scene      ${result.sceneSummary}`);
  console.log(
    `  viewport   ${String(viewport.width)}x${String(viewport.height)}   preset ${preset}`,
  );
  console.log(
    `  browser    ${headed ? 'HEADED' : 'HEADLESS (software rasteriser — not quotable)'}`,
  );
  console.log(`  display    idle frame interval ${ms(result.idleInterval)}`);
  console.log('');

  // ── Non-vacuity FIRST. A treatment that drew nothing passes every pacing gate. ──────────────
  const { visibleChangedBars, visibleChangedLinks, visibleBars, visibleLinks } = result.counts;
  const share = (n, d) => (d === 0 ? 0 : (n / d) * 100);
  const barShare = share(visibleChangedBars, visibleBars);
  const linkShare = share(visibleChangedLinks, visibleLinks);
  console.log(
    `  changed on screen: ${String(visibleChangedBars)}/${String(visibleBars)} bars ` +
      `(${barShare.toFixed(1)}%), ${String(visibleChangedLinks)}/${String(visibleLinks)} links ` +
      `(${linkShare.toFixed(1)}%)`,
  );
  const enough = (n, d) =>
    Number.isFinite(n) &&
    Number.isFinite(d) &&
    n >= MIN_CHANGED_ABSOLUTE &&
    share(n, d) >= MIN_CHANGED_FRACTION * 100;
  if (!enough(visibleChangedBars, visibleBars) || !enough(visibleChangedLinks, visibleLinks)) {
    throw new Error(
      `NON-VACUITY FAILED — the treatment does not draw enough to judge.\n` +
        `  bars  ${String(visibleChangedBars)}/${String(visibleBars)} = ${barShare.toFixed(1)}% ` +
        `(need >= ${String(MIN_CHANGED_FRACTION * 100)}% and >= ${String(MIN_CHANGED_ABSOLUTE)})\n` +
        `  links ${String(visibleChangedLinks)}/${String(visibleLinks)} = ${linkShare.toFixed(1)}% ` +
        `(need >= ${String(MIN_CHANGED_FRACTION * 100)}% and >= ${String(MIN_CHANGED_ABSOLUTE)})\n` +
        `This is NOT a pass. A verdict computed from this run would be meaningless.`,
    );
  }

  const baselineDropped = result.pairs.map((p) => p.baseline.droppedPct);
  const treatmentDropped = result.pairs.map((p) => p.treatment.droppedPct);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

  if (result.pairs.length === 0 || baselineDropped.some((x) => !Number.isFinite(x))) {
    throw new Error('NOTHING TO JUDGE — no finite pair results. Refusing to print a verdict.');
  }

  console.log('');
  for (const [i, p] of result.pairs.entries()) {
    console.log(
      `  pair ${String(i + 1)}  baseline  dropped ${pct(p.baseline.droppedPct)}  ` +
        `p50 ${ms(p.baseline.intervalP50)}  p95 ${ms(p.baseline.intervalP95)}  ` +
        `${p.baseline.fps.toFixed(1)} fps`,
    );
    console.log(
      `          treatment dropped ${pct(p.treatment.droppedPct)}  ` +
        `p50 ${ms(p.treatment.intervalP50)}  p95 ${ms(p.treatment.intervalP95)}  ` +
        `${p.treatment.fps.toFixed(1)} fps`,
    );
  }

  const baseMean = mean(baselineDropped);
  const treatMean = mean(treatmentDropped);
  const delta = treatMean - baseMean;
  // **The baseline's own spread is printed**, so a reader can see whether the difference sits
  // inside it — ADR-0100 M0's design, which is the one that passed.
  const baseSpread = Math.max(...baselineDropped) - Math.min(...baselineDropped);
  const treatFps = mean(result.pairs.map((p) => p.treatment.fps));

  console.log('');
  console.log(`  baseline  mean dropped ${pct(baseMean)}   (run-to-run spread ${pct(baseSpread)})`);
  console.log(`  treatment mean dropped ${pct(treatMean)}`);
  console.log(`  delta     ${delta >= 0 ? '+' : ''}${pct(delta)}`);
  console.log('');

  if (preset === 'fit') {
    // Measured and REPORTED, never gated: the baseline already drops 10.2 % here (#75), and a gate
    // that fails on day one gets deleted rather than fixed (ADR-0058).
    console.log(
      '  P3 — Fit is REPORTED, NOT GATED (see m0-condition.md). No verdict at this preset.',
    );
    console.log('');
  } else {
    const p1 = delta <= MAX_DROPPED_DELTA_PP;
    const p2 = treatFps >= MIN_FPS;
    console.log(
      `  P1 difference  delta ${delta >= 0 ? '+' : ''}${pct(delta)} vs <= ${pct(MAX_DROPPED_DELTA_PP)}   ${p1 ? 'PASS' : 'FAIL'}`,
    );
    console.log(
      `  P2 absolute    ${treatFps.toFixed(1)} fps vs >= ${String(MIN_FPS)} fps   ${p2 ? 'PASS' : 'FAIL'}`,
    );
    console.log('');
    console.log(`  VERDICT: ${p1 && p2 ? 'PROCEED' : 'WITHDRAW OR REDESIGN tier 2b'}`);
    console.log('');
    if (delta > 0 && delta <= baseSpread) {
      console.log(
        "  NOTE: the difference sits INSIDE the baseline's own run-to-run spread, so it is not\n" +
          '  distinguishable from noise on this machine. Treat it as "no measurable cost", not as\n' +
          '  a measured small cost.',
      );
      console.log('');
    }
    if (!p1 || !p2) process.exitCode = 1;
  }
} finally {
  await browser.close();
  rmSync(out, { recursive: true, force: true });
}
