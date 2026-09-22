#!/usr/bin/env node
/**
 * **logic-legibility M0-T3 — FC-L4's avoidable denominator.**
 *
 *   node scripts/measure-avoidable.mjs
 *
 * FC-L4 asks M2 to realise **≥ 70 % of the AVOIDABLE occlusions M0 measured**, and says in as many
 * words that "the quantity it is a fraction of does not exist yet; it is produced by M0, **before
 * M2 is built**, and fixed in `m0-measurement.md` the day it is taken. The _rule_ is committed
 * there, the _denominator_ is measured, and neither can be adjusted to suit the result afterwards."
 *
 * This produces it. Of the links whose legs cross a bar that is not their own, how many could have
 * been routed clear by `routeOrthogonal`'s EXISTING candidate list or its gutter route?
 *
 * ## The control, printed first and throwing
 *
 * The denominator is computed from rebuilt routes rather than from the recording, because a
 * recorded polyline is one line already chosen and cannot answer a counterfactual. So the
 * reconstruction is checked rather than asserted: an order-insensitive digest of the model line set
 * against the same digest of the painted one. Equal means the model IS the picture, point for
 * point, and the denominator is exact. Unequal is reported as unequal — the figure is then an
 * approximation and says so — rather than being quietly presented as a measurement.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

const out = mkdtempSync(join(tmpdir(), 'sp-avoid-'));
const bundle = join(out, 'probe.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/crossing-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { unit300Layouts, readBoth, avoidableOcclusions } = await import(pathToFileURL(bundle).href);

const { asap, shipped } = unit300Layouts(FIXTURE, { rollUpSummaries: true });

console.log(`\n[logic-legibility M0-T3 / FC-L4] node, ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log(
  `  Unit 300 — ${String(asap.activities.length)} activities, WBS band OFF, shipped layout\n`,
);

const rows = [];
for (const pxPerDay of [1, 4, 12]) {
  const painted = readBoth(asap, shipped, pxPerDay, 32);
  const model = avoidableOcclusions(asap, shipped, pxPerDay, 32);
  const exact = painted.sortedFingerprint === model.sortedFingerprint;
  rows.push({ pxPerDay, painted, model, exact });
  console.log(
    `  ${String(pxPerDay).padStart(2)} px/day — reconstruction ${exact ? 'EXACT' : 'DIVERGENT'} ` +
      `(painted ${painted.sortedFingerprint} / model ${model.sortedFingerprint})`,
  );
  if (!exact) {
    console.log(
      `      painted ${String(painted.visibleLinks)} links, ${String(painted.foreignLinks)} foreign-occluded; ` +
        `model ${String(model.modelLinks)} links, ${String(model.modelForeignLinks)} foreign-occluded`,
    );
  }
}

console.log('');
console.log(
  `    ${'zoom'.padStart(5)} ${'links'.padStart(5)} ${'foreign-occluded'.padStart(16)} ` +
    `${'AVOIDABLE'.padStart(16)} ${'by candidate'.padStart(12)} ${'by gutter'.padStart(9)} ` +
    `${'+M1 gutter'.padStart(18)} ${'any corridor'.padStart(12)} ` +
    `${'tight VHV'.padStart(9)} ${'CEILING'.padStart(16)}`,
);
for (const { pxPerDay, model } of rows) {
  const share = model.modelForeignLinks === 0 ? 0 : model.avoidable / model.modelForeignLinks;
  console.log(
    `    ${String(pxPerDay).padStart(5)} ${String(model.modelLinks).padStart(5)} ` +
      `${String(model.modelForeignLinks).padStart(16)} ` +
      `${`${String(model.avoidable)} (${(share * 100).toFixed(1)}%)`.padStart(16)} ` +
      `${String(model.avoidableByCandidate).padStart(12)} ${String(model.avoidableByGutter).padStart(9)} ` +
      `${`${String(model.avoidableWithClearGutter)} (${((model.avoidableWithClearGutter / model.modelForeignLinks) * 100).toFixed(1)}%)`.padStart(18)} ` +
      `${String(model.avoidableByAnyCorridor).padStart(12)} ${String(model.avoidableByTightGutter).padStart(9)} ` +
      `${`${String(model.avoidableByEither)} (${((model.avoidableByEither / model.modelForeignLinks) * 100).toFixed(1)}%)`.padStart(16)}`,
  );
}

console.log(
  `\n  "+M1 gutter" is the same measurement with the VHV leg moved to the lane boundary — the\n` +
    `  middle of the clear band, where a bar can never be. Today \`gutterY\` IS the upper lane's bar\n` +
    `  bottom (ADR-0149 D3), so the router's own last-resort escape has never been usable, and that\n` +
    `  column says what M1 is worth to M2's ceiling BEFORE either is built.\n` +
    `\n  "any corridor" sweeps EVERY x at 1 px rather than the four the router tries, and "tight VHV"\n` +
    `  is a gutter route whose legs hug BOTH anchors instead of meeting at the midpoint. Neither is a\n` +
    `  proposal for the paint path — ADR-0065's bounded, fixed-order rule stands. They are the\n` +
    `  CEILING, and they say whether M2's remedy is a wider search or more room.\n` +
    '\n  FC-L4: M2 must clear at least 70% of AVOIDABLE, and `x/link` may rise by no more than 10%.\n' +
    '  Below 20% of avoidable, M2 is WITHDRAWN and recorded as measured-and-rejected.\n' +
    '  The residue — foreign-occluded links with no clear corridor and no clear gutter — is what\n' +
    '  the 30% FC-L4 allows is expected to be made of, and it is the argument for M1 and M3.\n',
);
