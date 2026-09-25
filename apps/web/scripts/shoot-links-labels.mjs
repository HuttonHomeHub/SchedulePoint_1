#!/usr/bin/env node
/**
 * **Links-and-labels M2-T6 — the four fixtures before and after the text term.**
 *
 *   node scripts/shoot-links-labels.mjs            (from apps/web)
 *
 * Paints each fixture with the real painter in Chromium twice: text-blind (the router is given no
 * text and no plates, which is what it was given before M2) and as shipped. brief, small-17 and the
 * reference plan at 12 px/day, where names, dates and plates are all drawn; Unit 300 at 4 px/day,
 * cropped to its first 1646 px. Writes eight PNGs to `docs/specs/links-and-labels/`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const here = process.cwd();
const out = mkdtempSync(join(tmpdir(), 'sp-links-labels-shot-'));

const nodeEntry = join(out, 'node-entry.ts');
writeFileSync(
  nodeEntry,
  `export { fixtures } from ${JSON.stringify(`${here}/scripts/attachment-probe.ts`)};\n`,
);
await build({
  entryPoints: [nodeEntry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(out, 'node.mjs'),
  logLevel: 'warning',
});
const probe = await import(pathToFileURL(join(out, 'node.mjs')).href);

const shim = resolve('scripts/shoot-links-labels-shim.ts');
await build({
  entryPoints: [resolve('scripts/shoot-links-labels-bench.ts')],
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outfile: join(out, 'bench.mjs'),
  logLevel: 'warning',
  plugins: [
    {
      name: 'links-labels-shim',
      setup(b) {
        b.onResolve({ filter: /route-frame$/ }, (args) =>
          args.importer === shim ? undefined : { path: shim },
        );
      },
    },
  ],
});
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

const SLUG = {
  brief: 'brief',
  'small-17': 'small-17',
  'reference-netpoint': 'reference-netpoint',
  'Unit 300': 'unit-300',
};
const written = [];
for (const fx of probe.fixtures(FIXTURE)) {
  const pxPerDay = fx.name === 'Unit 300' ? 4 : 12;
  const view = { pxPerDay, originX: 40, originY: 32 };
  const full = fx.sizeAt(pxPerDay, 32);
  const size = { width: Math.min(full.width, 1646), height: full.height };
  for (const textBlind of [true, false]) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>${tokens}</style>
       <style>body{margin:0}#host{background:var(--canvas)}
         #c{display:block;width:${size.width}px;height:${size.height}px}</style>
       <div id="host" data-surface="canvas"><canvas id="c"></canvas></div>`,
    );
    await page.addScriptTag({ path: join(out, 'bench.mjs'), type: 'module' });
    await page.evaluate(
      ({ scene: sent, allWorking, view: v, size: s, textBlind: blind }) => {
        // A function does not cross the page boundary; the fixtures' only predicate is "every day".
        const scene = allWorking ? { ...sent, isWorkingDay: () => true } : sent;
        const canvas = globalThis.document.getElementById('c');
        canvas.width = s.width;
        canvas.height = s.height;
        globalThis.renderLinksLabels({
          canvas,
          root: globalThis.document.getElementById('host'),
          scene,
          view: v,
          size: s,
          dpr: 1,
          textBlind: blind,
        });
      },
      {
        scene: { ...fx.scene, isWorkingDay: undefined },
        allWorking: fx.scene.isWorkingDay !== undefined,
        view,
        size,
        textBlind,
      },
    );
    const file = `docs/specs/links-and-labels/m2-${SLUG[fx.name]}-${textBlind ? 'before' : 'after'}.png`;
    await page.screenshot({ path: join('../..', file) });
    await page.close();
    written.push(
      `${fx.name} ${pxPerDay} px/day ${textBlind ? 'text-blind' : 'shipped   '} -> ${file}`,
    );
  }
}
await browser.close();
console.log(`\n[links-and-labels M2-T6] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
for (const line of written) console.log(`  ${line}`);
