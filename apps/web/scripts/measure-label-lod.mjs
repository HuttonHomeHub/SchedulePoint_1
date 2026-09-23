#!/usr/bin/env node
/**
 * Drive `label-lod-bench.ts` in Chromium and print text-on vs text-off paint time at the zooms the
 * label gate used to withhold text at (`docs/TECH_DEBT.md` #378).
 *
 *   node scripts/measure-label-lod.mjs [frames] [--headed]
 *
 * Headless Chromium may rasterise Canvas 2D in software, so a headless number bounds the work and
 * is not what a planner's machine does (`docs/guides/measure-draw-performance.md`).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
const frames = Number(argv.find((a) => /^\d+$/.test(a)) ?? 120);
const bundle = join(mkdtempSync(join(tmpdir(), 'sp-label-lod-')), 'bench.js');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/label-lod-bench.ts',
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
const browser = await chromium.launch({
  headless: !headed,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent('<canvas width="1920" height="1080"></canvas>');
  await page.addScriptTag({ path: bundle });
  // eslint-disable-next-line no-undef
  const result = await page.evaluate((n) => window.__benchLabelLod(n), frames);
  const row = (label, r) =>
    `  ${label.padEnd(9)} p50 ${r.p50.toFixed(2)}ms   p95 ${r.p95.toFixed(2)}ms   max ${r.max.toFixed(2)}ms`;
  console.log(
    `\n[#378] Chromium ${headed ? 'headed' : 'HEADLESS'} 1920x1080, ${result.scene}, ${frames} frames\n` +
      result.results
        .map(
          (r) =>
            `\n  ── ${r.pxPerDay} px/day ──\n${row('text off', r.off)}\n${row('text on', r.on)}\n` +
            `  delta     p50 ${(r.on.p50 - r.off.p50).toFixed(2)}ms   p95 ${(r.on.p95 - r.off.p95).toFixed(2)}ms`,
        )
        .join('\n'),
  );
} finally {
  await browser.close();
}
