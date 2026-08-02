#!/usr/bin/env node
/**
 * Drive `link-routing-bench.ts` in a real Chromium and print the distribution (ADR-0065 / T21).
 *
 * Deliberately a script, not a test: absolute timings on a CI runner are noise (the reasoning
 * `paint.dates-budget.test.ts` records), so this is run by a human on a known machine and its
 * numbers are quoted with the machine they came from. The CI-safe half of the same question — is
 * the extra work *bounded* — lives in `paint.routing-budget.test.ts`.
 *
 *   node scripts/measure-link-routing.mjs [frames] [scale|grid] [--headed] [--viewport WxH]
 *
 * `--headed` matters more than it looks. Headless Chromium can serve Canvas 2D from a software
 * rasteriser, so a headless number measures a code path a planner never runs. Use it for any
 * measurement that is going to be quoted as "what this machine does" — see
 * `docs/guides/measure-draw-performance.md`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
const viewportAt = argv.indexOf('--viewport');
// Positional args, with the flags and their values removed so `[frames] [scene]` keeps working.
const flagIndexes = new Set(
  argv.flatMap((a, i) => (a === '--headed' ? [i] : a === '--viewport' ? [i, i + 1] : [])),
);
const positional = argv.filter((_, i) => !flagIndexes.has(i));

/**
 * The viewport the scene is culled against — 1920x1080 by default, deliberately, because every
 * number already published for this benchmark was measured there and a silent change would make a
 * laptop run incomparable with them. Pass your real one as a SECOND run when you want to know what
 * you personally see; the two answer different questions.
 */
const viewportArg = viewportAt === -1 ? '1920x1080' : (argv[viewportAt + 1] ?? '');
const viewportMatch = /^(\d+)x(\d+)$/.exec(viewportArg);
if (!viewportMatch) {
  console.error(`Bad --viewport "${viewportArg}" — expected WxH, e.g. 1440x900.`);
  process.exit(1);
}
const viewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };

const frames = Number(positional[0] ?? 120);
// Which picture to paint. `scale` is the ADR-0066 generator's realistic programme; `grid` is the
// original synthetic lattice, kept because ADR-0065's published numbers were measured on it and a
// silent swap would make this run incomparable with the one already quoted.
const scene = positional[1] ?? 'scale';
if (scene !== 'scale' && scene !== 'grid') {
  console.error(`Unknown scene "${scene}" — expected "scale" or "grid".`);
  process.exit(1);
}
const out = mkdtempSync(join(tmpdir(), 'sp-bench-'));
const bundle = join(out, 'bench.js');

// The esbuild **CLI** rather than its JS API: esbuild is a transitive dependency of Vite, not a
// direct one, so under pnpm's strict layout this file cannot `import` it — and adding a direct
// dependency for a hand-run measurement script would be a real cost for no gain.
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/link-routing-bench.ts',
    '--bundle',
    '--format=iife',
    '--target=chrome120',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

// Same discovery the e2e runner uses (`scripts/e2e-local.sh`): this environment ships browsers at a
// pinned path that need not match the Playwright build the workspace resolves, and the default
// lookup then reports "run npx playwright install" for a browser that is already present.
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

/**
 * `--headed` needs a display, and on a headless box the failure is a Chromium stack trace about
 * dbus and `$DISPLAY` that says nothing about what to do. Since this script exists to be run by a
 * person on their own machine, the one environment where it predictably fails should explain
 * itself rather than look broken.
 */
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
      'That is expected on a server or in a container. Two options:\n' +
      '  - Run this on your laptop, which is the whole point:\n' +
      '    docs/guides/measure-draw-performance.md\n' +
      '  - Drop --headed for a headless number, remembering that headless Chromium may\n' +
      '    rasterise Canvas 2D in software, so it measures a path no planner runs:\n' +
      '      node scripts/measure-link-routing.mjs 120 scale\n',
  );
  process.exit(1);
}
try {
  const page = await browser.newPage({ viewport });
  await page.setContent(
    `<canvas width="${String(viewport.width)}" height="${String(viewport.height)}"></canvas>`,
  );
  await page.addScriptTag({ path: bundle });
  // The callback is serialised and evaluated in the PAGE, where `window` is the bench's own
  // global; this file itself runs in Node, which is why the rule fires and why it is wrong here.
  const result = await page.evaluate(
    // eslint-disable-next-line no-undef
    ([n, s]) => window.__benchLinkRouting(n, s),
    /** @type {[number, 'scale' | 'grid']} */ ([frames, scene]),
  );
  const row = (label, r) =>
    `  ${label.padEnd(12)} p50 ${r.p50.toFixed(2)}ms   p95 ${r.p95.toFixed(2)}ms   max ${r.max.toFixed(2)}ms`;
  const blocks = result.results.map(
    (r) =>
      `\n  ── ${r.zoom} (${r.pxPerDay}px/day) ──\n${row('routing off', r.off)}\n${row('routing on', r.on)}\n` +
      `  delta        p50 ${(r.on.p50 - r.off.p50).toFixed(2)}ms   ` +
      `p95 ${(r.on.p95 - r.off.p95).toFixed(2)}ms`,
  );
  console.log(
    `\n[ADR-0065 T21 / ADR-0066 M4.3] Chromium ${headed ? 'headed' : 'HEADLESS'} ` +
      `${String(viewport.width)}x${String(viewport.height)}, scene "${scene}": ${result.scene}, ` +
      `${frames} panning frames per case${blocks.join('\n')}\n` +
      (headed
        ? ''
        : '  NOTE: headless Chromium may rasterise Canvas 2D in software. Re-run with --headed\n' +
          '  before quoting these as what this machine does.\n'),
  );
} finally {
  await browser.close();
  rmSync(out, { recursive: true, force: true });
}
