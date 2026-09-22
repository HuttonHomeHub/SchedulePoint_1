#!/usr/bin/env node
/**
 * **M-C0-T4 — is the inter-lane gutter the term?** (FC-C3)
 *
 *   node scripts/measure-gutter-pitch.mjs
 *
 * FC-C3 asks for a pitch at which "two runs through one gutter read as two lines, clear of both bar
 * edges", judged on a rendered image at 1646 rather than on arithmetic. This produces both: the
 * arithmetic that says whether any pitch CAN satisfy it, and the picture a person judges.
 *
 * ## How the pitch is varied, and why nothing in the repository is touched
 *
 * `LANE_HEIGHT` is a module constant with 37 call sites, so a sweep has to change it somehow. The
 * obvious route — patch `geometry.ts`, build, restore — leaves a tracked file modified for the
 * length of the run and relies on a `finally` that a crash can skip.
 *
 * Instead the **bundle** is rewritten: esbuild emits `var LANE_HEIGHT = 28;` as a real binding and
 * references it (verified — it does not inline it), so one textual substitution in a temp file
 * changes every call site at once. The substitution asserts **exactly one** match, and each variant
 * reports the `laneHeight` it actually painted with, so a substitution that silently failed shows
 * up as a reading at the wrong pitch rather than as a plausible number.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

/**
 * **Every Part C figure is measured with `rollUpSummaries: true`**, and that is a correction to how
 * this harness started. Without it a `WBS_SUMMARY` sits at day 0 with its stored duration — zero on
 * this fixture, so eighteen invisible points at the plan start — where the engine derives its span
 * from its children (`compute.ts:545`, ADR-0035 §24). Found by LOOKING at a rendered picture, which
 * is the method this epic exists to apply, after every number here had already been taken without
 * it. What it changes is recorded in `part-c-m-c0.md`; the short version is that every headline
 * conclusion survived or strengthened and one sub-finding was refuted.
 */
const ROLL_UP = { rollUpSummaries: true };
/** The product owner's Surface Pro: 2880x1920 at 175 % = 1646 CSS px. */
const WIDTH = 1646;
const DPR = 1.75;
const ZOOMS = [4, 12];
/** 28 is what ships. The others are the candidates FC-C3 would choose between. */
const PITCHES = [28, 36, 44];

const out = mkdtempSync(join(tmpdir(), 'sp-gutter-'));

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
  return readFileSync(outfile, 'utf8');
};

const baseNode = build('scripts/crossing-probe.ts', 'esm', join(out, 'probe.mjs'));

/** One textual substitution, asserted to be unique — a silent miss would grade the wrong pitch. */
const atPitch = (source, pitch) => {
  const pattern = /\bvar LANE_HEIGHT = \d+;/g;
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `M-C0-T4 INDETERMINATE: expected exactly one \`var LANE_HEIGHT = N;\` in the bundle and ` +
        `found ${matches.length}. esbuild's output shape has changed — the pitch sweep would ` +
        `silently grade the shipped value at every step. Refusing to measure.`,
    );
  }
  return source.replace(pattern, `var LANE_HEIGHT = ${String(pitch)};`);
};

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[diagram-legibility Part C M-C0-T4 / FC-C3] node, ${new Date().toISOString()}`);
console.log(`  commit   ${commit}`);
console.log(`  fixture  p6_torture_test_v1.xer — "Unit 300 Amine", band off, lanes arranged\n`);

const rows = [];
for (const pitch of PITCHES) {
  const file = join(out, `probe-${String(pitch)}.mjs`);
  writeFileSync(file, atPitch(baseNode, pitch));
  const { gutterReadings } = await import(pathToFileURL(file).href);
  for (const r of gutterReadings(FIXTURE, ZOOMS, ROLL_UP)) {
    if (r.laneHeight !== pitch) {
      throw new Error(
        `M-C0-T4 INDETERMINATE: asked for pitch ${String(pitch)} and the painter reported ` +
          `${String(r.laneHeight)}. The substitution did not take. Refusing to measure.`,
      );
    }
    rows.push(r);
  }
}

console.log(
  `    ${'pitch'.padStart(5)} ${'gutter'.padStart(6)} ${'px/d'.padStart(4)} ` +
    `${'links'.padStart(5)} ${'VHV'.padStart(4)} ${'legs'.padStart(5)} ${'y vals'.padStart(6)} ` +
    `${'max/y'.padStart(5)} ${'on a bar'.padStart(8)} ${'clearance'.padStart(9)}`,
);
for (const r of rows) {
  console.log(
    `    ${String(r.laneHeight).padStart(5)} ${String(r.gutterHeight).padStart(6)} ` +
      `${String(r.pxPerDay).padStart(4)} ${String(r.links).padStart(5)} ` +
      `${String(r.vhvRoutes).padStart(4)} ${String(r.gutterLegs).padStart(5)} ` +
      `${String(r.distinctGutterY).padStart(6)} ${String(r.maxLegsOnOneY).padStart(5)} ` +
      `${String(r.legsTouchingABar).padStart(8)} ${r.minClearancePx.toFixed(1).padStart(9)}`,
  );
}

// ---- the control: the sweep has to have something to sweep ----
if (rows.every((r) => r.gutterLegs === 0)) {
  throw new Error(
    'M-C0-T4 INDETERMINATE: no configuration produced a single gutter leg, so this run measures ' +
      'nothing about the gutter. Either the VHV fallback stopped firing on this fixture or the ' +
      'leg identification is wrong. Refusing to judge.',
  );
}

console.log('\n  FC-C3, first half — can two runs through one gutter read as two lines?\n');
const worst = Math.max(...rows.map((r) => r.maxLegsOnOneY));
for (const pitch of PITCHES) {
  const at = rows.filter((r) => r.laneHeight === pitch);
  const shared = Math.max(...at.map((r) => r.maxLegsOnOneY));
  const distinct = Math.max(...at.map((r) => r.distinctGutterY));
  console.log(
    `    pitch ${String(pitch).padStart(2)} (gutter ${String(pitch - 18).padStart(2)} px)  ` +
      `${String(shared).padStart(2)} legs share one y across ${String(distinct)} distinct y values`,
  );
}
console.log(
  `\n    Widening the pitch changes NEITHER number, and it cannot: \`routeOrthogonal\` derives the\n` +
    `    leg's y as \`(gutterLane + 1) * laneHeight - (laneHeight - barHeight) / 2\`, which has no\n` +
    `    per-link term at any pitch. ${String(worst)} legs drawn at one y are ${String(worst)} lines drawn on top of\n` +
    `    each other, however tall the gutter is.`,
);

console.log('\n  FC-C3, second half — is the leg clear of both bar edges?\n');
for (const pitch of PITCHES) {
  const at = rows.filter((r) => r.laneHeight === pitch);
  const touching = Math.max(...at.map((r) => r.legsTouchingABar));
  const clear = Math.min(...at.map((r) => r.minClearancePx));
  console.log(
    `    pitch ${String(pitch).padStart(2)}  legs lying within a painted bar's extent: ` +
      `${String(touching)}  ·  smallest gap to a bar edge: ${clear.toFixed(1)} px`,
  );
}

// ---- the picture FC-C3 asks to be judged on ----
// ESM rather than IIFE: `paint.ts` reads `import.meta.env.DEV` for a development-only throw, and
// esbuild warns that it is empty under IIFE — which would silently disable the one guard that
// catches an unresolved canvas fill (ADR-0121's `fillStyle` finding).
const baseBrowser = build('scripts/gutter-pitch-bench.ts', 'esm', join(out, 'bench.mjs'));
const tokens = readFileSync('src/styles/globals.css', 'utf8');
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

const { sceneForShot } = await import(pathToFileURL(join(out, 'probe-28.mjs')).href);
const shotScene = sceneForShot(FIXTURE, ROLL_UP);

const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
for (const pitch of PITCHES) {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: 420 },
    deviceScaleFactor: DPR,
  });
  // The real stylesheet on a real canvas surface, so `resolveTsldPalette` reads the real tokens
  // through ADR-0102's canvas scope rather than a hex literal standing in for one.
  await page.setContent(
    `<style>${tokens}</style>
     <style>body{margin:0}#host{background:var(--canvas)}
       #c{display:block;width:${String(WIDTH)}px;height:420px}</style>
     <div id="host" data-surface="canvas"><canvas id="c"></canvas></div>`,
  );
  const variant = join(out, `bench-${String(pitch)}.mjs`);
  writeFileSync(variant, atPitch(baseBrowser, pitch));
  await page.addScriptTag({ path: variant, type: 'module' });
  const painted = await page.evaluate(
    ({ scene, focusLane, width, height, dpr, pxPerDay }) => {
      const canvas = globalThis.document.getElementById('c');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      return globalThis.renderGutterSample({
        canvas,
        root: globalThis.document.getElementById('host'),
        scene,
        focusLane,
        pxPerDay,
        size: { width, height },
        dpr,
      });
    },
    {
      scene: shotScene.scene,
      focusLane: shotScene.focusLane,
      width: WIDTH,
      height: 420,
      dpr: DPR,
      pxPerDay: 12,
    },
  );
  // The same control the arithmetic sweep carries: a substitution that silently failed would
  // produce three identical pictures that look like a finding.
  if (painted.laneHeight !== pitch) {
    throw new Error(
      `M-C0-T4 INDETERMINATE: the browser bundle painted at pitch ${String(painted.laneHeight)} ` +
        `when ${String(pitch)} was asked for. Refusing to write a picture that misreports itself.`,
    );
  }
  await page.screenshot({
    path: join('../..', `docs/specs/diagram-legibility/gutter-pitch-${String(pitch)}.png`),
  });
  await page.close();
}
await browser.close();
console.log(
  `\n  Pictures written to docs/specs/diagram-legibility/gutter-pitch-{${PITCHES.join(',')}}.png` +
    ` (1646 CSS px, DPR ${String(DPR)}).\n  FC-C3 is judged on those by a person, not by this script.`,
);
