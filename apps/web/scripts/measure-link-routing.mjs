#!/usr/bin/env node
/**
 * Drive `link-routing-bench.ts` in a real Chromium and print the distribution (ADR-0065 / T21).
 *
 * Deliberately a script, not a test: absolute timings on a CI runner are noise (the reasoning
 * `paint.dates-budget.test.ts` records), so this is run by a human on a known machine and its
 * numbers are quoted with the machine they came from. The CI-safe half of the same question — is
 * the extra work *bounded* — lives in `paint.routing-budget.test.ts`.
 *
 *   node scripts/measure-link-routing.mjs [frames]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const frames = Number(process.argv[2] ?? 120);
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

const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent('<canvas width="1920" height="1080"></canvas>');
  await page.addScriptTag({ path: bundle });
  // The callback is serialised and evaluated in the PAGE, where `window` is the bench's own
  // global; this file itself runs in Node, which is why the rule fires and why it is wrong here.
  // eslint-disable-next-line no-undef
  const result = await page.evaluate((n) => window.__benchLinkRouting(n), frames);
  const row = (label, r) =>
    `  ${label.padEnd(12)} p50 ${r.p50.toFixed(2)}ms   p95 ${r.p95.toFixed(2)}ms   max ${r.max.toFixed(2)}ms`;
  const blocks = result.results.map(
    (r) =>
      `\n  ── ${r.zoom} (${r.pxPerDay}px/day) ──\n${row('routing off', r.off)}\n${row('routing on', r.on)}\n` +
      `  delta        p50 ${(r.on.p50 - r.off.p50).toFixed(2)}ms   ` +
      `p95 ${(r.on.p95 - r.off.p95).toFixed(2)}ms`,
  );
  console.log(
    `\n[ADR-0065 T21] Chromium, 2,000 activities / ${result.edges} long-range edges, ` +
      `${frames} panning frames per case${blocks.join('\n')}\n`,
  );
} finally {
  await browser.close();
  rmSync(out, { recursive: true, force: true });
}
