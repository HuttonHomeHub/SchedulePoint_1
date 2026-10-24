#!/usr/bin/env node
/**
 * **The swimlane boundary rule, and the rule with the alternate ground, photographed** (swimlanes
 * M2-T2, ui-architecture C5).
 *
 *   node scripts/shoot-swimlane-rule.mjs
 *
 * Painted by the real `paintScene` against a real Chromium 2D context, with the real
 * `resolveTsldPalette` reading the real `globals.css` tokens through the canvas surface scope — the
 * method of `shoot-layouts.mjs`. The plan is the reference power plant split by system and laid out
 * by the partitioned Re-layout (the M0 reading's split), so the pictures show a real swimlane stack.
 * Two pictures, one scene: only `swimlaneMarks.ground` differs. The count of link runs that sit on a
 * boundary is printed, because that is the cost of putting the rule beneath the links (C5).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const out = mkdtempSync(join(tmpdir(), 'sp-swl-'));
const build = (entry, format, outfile, node) => {
  execFileSync(
    'pnpm',
    [
      'exec',
      'esbuild',
      entry,
      '--bundle',
      `--format=${format}`,
      node ? '--platform=node' : '--target=chrome120',
      `--outfile=${outfile}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit' },
  );
  return outfile;
};

const mod = await import(
  pathToFileURL(build('scripts/swimlane-rule-scenes.ts', 'esm', join(out, 'scenes.mjs'), true)).href
);
const { scene, marks, ...figures } = mod.swimlaneScene();
const bench = build('scripts/gutter-pitch-bench.ts', 'esm', join(out, 'bench.mjs'), false);
const tokens = readFileSync('src/styles/globals.css', 'utf8');
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

const { SIZE, VIEW } = mod;
const DPR = 1.5;
const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
for (const [slug, ground] of [
  ['rule-only', false],
  ['rule-and-ground', true],
]) {
  const page = await browser.newPage({
    viewport: { width: SIZE.width, height: SIZE.height },
    deviceScaleFactor: DPR,
  });
  await page.setContent(
    `<style>${tokens}</style>
     <style>body{margin:0}#host{background:var(--canvas)}
       #c{display:block;width:${String(SIZE.width)}px;height:${String(SIZE.height)}px}</style>
     <div id="host" data-surface="canvas"><canvas id="c"></canvas></div>`,
  );
  await page.addScriptTag({ path: bench, type: 'module' });
  await page.evaluate(
    ({ s, width, height, dpr, view }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // `focusLane: 0` frames lane 0 at 40 px, which is the view's own originY.
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene: s,
        focusLane: 0,
        pxPerDay: view.pxPerDay,
        originX: view.originX,
        size: { width, height },
        dpr,
      });
    },
    {
      s: { ...scene, swimlaneMarks: { extents: marks.extents, ground } },
      width: SIZE.width,
      height: SIZE.height,
      dpr: DPR,
      view: VIEW,
    },
  );
  const file = `docs/specs/swimlanes/m2-t2/reference-power-plant-${slug}.png`;
  await page.screenshot({ path: join('../..', file) });
  await page.close();
  console.log(`  ${slug.padEnd(16)} -> ${file}`);
}
await browser.close();
console.log(`\n  ${JSON.stringify(figures)}`);
