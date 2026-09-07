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
import { pathToFileURL } from 'node:url';

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

// The non-vacuity floors and both gate constants now live in
// `src/features/perf-probe/model/judge.ts` and are imported below with the judge itself. They were
// duplicated here until M1; the linter is what noticed, once the arithmetic that used them moved.

const out = mkdtempSync(join(tmpdir(), 'sp-revdiff-'));
const bundle = join(out, 'bench.js');
const judgeBundle = join(out, 'judge.mjs');

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

// **The judge is bundled too, and that is the point of M1** — this driver used to hold its own
// copy of the verdict arithmetic (lines 153-243, before the extraction). Two copies of a judgement
// drift invisibly: each looks right alone, and only somebody comparing two published numbers months
// apart would ever notice (ADR-0065's `routeOrthogonal`, ADR-0121's `stackSeries`). So the logic
// lives in `src/features/perf-probe/model/judge.ts`, the browser panel imports it directly, and this
// file compiles the same module for Node rather than reimplementing it.
//
// ESM rather than the bench's IIFE: this one is `import()`ed here, not injected into a page.
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'src/features/perf-probe/model/probe-cli-exports.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${judgeBundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

const { judgeRun, NothingToJudgeError, scenarioById, isGated } = await import(
  pathToFileURL(judgeBundle).href
);

// The scenario says whether this run is gated and against which bars, rather than this file
// deciding again. That rule used to live here as `preset !== 'fit'` with the two constants
// inline — and two callers agreeing on HOW to judge while disagreeing about WHICH question
// they asked is the subtler half of the drift M1 exists to remove.
const SCENARIO = scenarioById('revision-diff');

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

  // ── Non-vacuity, the pair table, and the verdict all come from the SHARED judge now. ────────
  //
  // What is left here is presentation. `judgeRun` owns every decision — the non-vacuity floor, the
  // refusal to judge an empty run, and the verdict itself — and it throws `NothingToJudgeError`
  // rather than returning something a caller might print. This file's job is to say it out loud.
  const { visibleChangedBars, visibleChangedLinks, visibleBars, visibleLinks } = result.counts;
  const share = (n, d) => (d === 0 ? 0 : (n / d) * 100);
  console.log(
    `  changed on screen: ${String(visibleChangedBars)}/${String(visibleBars)} bars ` +
      `(${share(visibleChangedBars, visibleBars).toFixed(1)}%), ` +
      `${String(visibleChangedLinks)}/${String(visibleLinks)} links ` +
      `(${share(visibleChangedLinks, visibleLinks).toFixed(1)}%)`,
  );

  let judged;
  try {
    judged = judgeRun({
      pairs: result.pairs,
      counts: result.counts,
      barPp: SCENARIO.barPp,
      minFps: SCENARIO.minFps,
      gated: isGated(SCENARIO, preset),
    });
  } catch (error) {
    // Preserved deliberately: a run that cannot be judged EXITS NON-ZERO with the reason, and does
    // not print a verdict. The condition file demanded exactly this of the harness, and the control
    // cell exercised it on the first run.
    if (error instanceof NothingToJudgeError) throw error;
    throw error;
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

  console.log('');
  console.log(
    `  baseline  mean dropped ${pct(judged.baselineMeanPp)}   ` +
      `(run-to-run spread ${pct(judged.baselineSpreadPp)})`,
  );
  console.log(`  treatment mean dropped ${pct(judged.treatmentMeanPp)}`);
  console.log(`  delta     ${judged.deltaPp >= 0 ? '+' : ''}${pct(judged.deltaPp)}`);
  console.log('');

  if (judged.verdict === 'REPORTED_ONLY') {
    // Measured and REPORTED, never gated: the baseline already drops 10.2 % here (#75), and a gate
    // that fails on day one gets deleted rather than fixed (ADR-0058).
    console.log(
      '  P3 — Fit is REPORTED, NOT GATED (see m0-condition.md). No verdict at this preset.',
    );
    console.log('');
  } else {
    console.log(
      `  P1 difference  delta ${judged.deltaPp >= 0 ? '+' : ''}${pct(judged.deltaPp)} vs <= ` +
        `${pct(SCENARIO.barPp)}   ${judged.p1 ? 'PASS' : 'FAIL'}`,
    );
    console.log(
      `  P2 absolute    ${judged.treatmentFps.toFixed(1)} fps vs >= ${String(SCENARIO.minFps)} fps   ` +
        `${judged.p2 ? 'PASS' : 'FAIL'}`,
    );
    console.log('');
    if (judged.verdict === 'INDETERMINATE') {
      // **The correction this epic exists to make automatic.** This used to print as a NOTE after a
      // verdict, which reads as a result somebody should act on; a human had to spot it by hand and
      // write the finding into `m0-condition.md`. It is a verdict now, and it outranks P1/P2 — an
      // unfit instrument's PASS and its FAIL are equally meaningless.
      console.log('  VERDICT: INDETERMINATE — this machine cannot answer the question.');
      console.log('');
      console.log(`  Because ${judged.indeterminateReason}`);
      console.log('');
    } else {
      console.log(
        `  VERDICT: ${judged.verdict === 'PASS' ? 'PROCEED' : 'WITHDRAW OR REDESIGN tier 2b'}`,
      );
      console.log('');
    }
    // An INDETERMINATE run is not a pass. It exits non-zero so a script cannot read silence as one.
    if (judged.verdict !== 'PASS') process.exitCode = 1;
  }
} finally {
  await browser.close();
  rmSync(out, { recursive: true, force: true });
}
