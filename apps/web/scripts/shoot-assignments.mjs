#!/usr/bin/env node
/**
 * **The shipped packing and the four assignment candidates, photographed** (logic-legibility M4,
 * FC-L6).
 *
 *   node scripts/shoot-assignments.mjs
 *
 * FC-L6 judges a candidate on a three-component vector and then says a qualifier goes to the
 * product owner **with a rendered picture**. That clause is not decoration: this epic exists
 * because a diagram that satisfied every number was still hard to read, so offering a layout on
 * its table alone would be the same mistake one metric further on.
 *
 * Painted by the real `paintScene` against a real Chromium 2D context, with the real
 * `resolveTsldPalette` reading the real `globals.css` tokens through ADR-0102's canvas surface
 * scope. Same viewport, same zoom, same framing for every layout — the lane assignment is the one
 * variable the comparison is about.
 *
 * The sibling of `shoot-layouts.mjs`, from which this is adapted; `rollUpSummaries` is on for the
 * reason that file records having learnt by LOOKING at a picture.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

/**
 * **There is no `rollUpSummaries` switch here, and that is deliberate.** `assignmentCandidates`
 * pins it on (`crossing-probe.ts`), so every M4 figure is measured that way and a picture taken any
 * other way would not be a picture of the thing that was measured. Its sibling `shoot-layouts.mjs`
 * carries the switch and the reason it exists: without it a `WBS_SUMMARY` sits at day 0 with its
 * stored duration — zero on this fixture — where the engine derives its span from its children
 * (`compute.ts:545`, ADR-0035 §24), a defect found by LOOKING at a rendered picture after every
 * number had been taken without it.
 */
/** The product owner's Surface Pro: 2880x1920 at 175 % = 1646 CSS px. */
const WIDTH = 1646;
const HEIGHT = 820;
const DPR = 1.75;
/** 4 px/day puts Unit 300's whole 391-day span on screen — the framing their screenshots show. */
const PX_PER_DAY = 4;

const SLUG = {
  'shipped (packed + hint)': 'shipped',
  'A chain rows': 'chain-rows',
  'B near predecessors': 'near-predecessors',
  'C depth-first pack': 'depth-first',
  'D lane re-indexing': 'lane-re-indexing',
};

const out = mkdtempSync(join(tmpdir(), 'sp-shoot-'));
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

const { candidateScenes } = await import(
  pathToFileURL(build('scripts/crossing-probe.ts', 'esm', join(out, 'probe.mjs'))).href
);
const bench = build('scripts/gutter-pitch-bench.ts', 'esm', join(out, 'bench.mjs'));
const scenes = candidateScenes(FIXTURE);
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
for (const { name, scene, lanes } of scenes) {
  const slug = SLUG[name];
  if (slug === undefined) {
    throw new Error(
      `No file name for the layout "${name}". A picture written under a guessed name is worse ` +
        `than none, because the reader cannot tell which layout they are looking at.`,
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
    ({ scene: s, width, height, dpr, pxPerDay }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene: s,
        // Lane 0 at the top: every layout is framed identically, so only the assignment differs.
        focusLane: 0,
        pxPerDay,
        size: { width, height },
        dpr,
      });
    },
    { scene, width: WIDTH, height: HEIGHT, dpr: DPR, pxPerDay: PX_PER_DAY },
  );
  const file = `docs/specs/logic-legibility/assignment-${slug}.png`;
  await page.screenshot({ path: join('../..', file) });
  await page.close();
  console.log(`  ${name.padEnd(24)} ${String(lanes).padStart(3)} lanes  ->  ${file}`);
}
await browser.close();
console.log(
  `\n  ${String(WIDTH)} CSS px x ${String(HEIGHT)}, DPR ${String(DPR)}, ${String(PX_PER_DAY)} px/day` +
    ` (Unit 300's whole span), lane 0 at the top in all of them.`,
);
