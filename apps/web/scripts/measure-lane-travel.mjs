#!/usr/bin/env node
/**
 * Drive `lane-travel-probe.ts` in node and print M0-T3's answer (FC-3's baseline).
 *
 *   node scripts/measure-lane-travel.mjs
 *
 * See the probe's docblock for the fixture correction it rests on (the "Unit 300" file IS in this
 * repository) and for what its as-early-as-possible layout is not.
 *
 * **The non-vacuity control is checked first and this THROWS rather than judging when it has
 * nothing to judge** (ADR-0130).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'sp-lanes-'));
const bundle = join(out, 'probe.mjs');

execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/lane-travel-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

try {
  const { probe } = await import(pathToFileURL(bundle).href);
  const xer = resolve('../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer');
  const results = probe(xer);

  if (results.length === 0) throw new Error('M0-T3 INDETERMINATE: no fixture was measured.');
  for (const r of results) {
    if (r.links === 0) {
      throw new Error(
        `M0-T3 INDETERMINATE: "${r.fixture}" produced zero links, so every lane-travel ` +
          `statistic over it is a division by nothing. Refusing to print a number.`,
      );
    }
  }

  const pct = (before, after) =>
    before === 0 ? '   —  ' : `${(((after - before) / before) * 100).toFixed(1).padStart(6)}%`;
  const row = (label, s) =>
    `    ${label.padEnd(16)} lanes ${String(s.lanes).padStart(4)}   ` +
    `mean |Δlane| ${s.meanDelta.toFixed(2).padStart(6)}   >5-lane links ${String(s.overFive).padStart(4)}`;

  console.log(
    `\n[diagram-legibility M0-T3 / FC-3 baseline] node, ${new Date().toISOString()}\n` +
      `  commit  ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}\n` +
      `  NOTE    Nobody has established that the product owner's 2026-09-21 screenshot is a\n` +
      `          picture of any of these plans, and they cannot supply the one they saw (CQ-4).\n` +
      `          Unit 300 IS in this repository, contrary to the spec, the plan and the M0\n` +
      `          conditions — see the probe's docblock. Its layout here is as-early-as-possible\n` +
      `          from the file's own durations and relationships, NOT a CPM result.\n`,
  );
  for (const r of results) {
    const base = r.packedWithHint;
    const vs = (label, s) =>
      s === null
        ? `    ${label.padEnd(22)} —`
        : `${row(label, s)}\n      vs shipped:  lanes ${pct(base.lanes, s.lanes)}   ` +
          `mean ${pct(base.meanDelta, s.meanDelta)}   >5 ${pct(base.overFive, s.overFive)}`;
    console.log(
      `  ── ${r.fixture} ──\n` +
        `     ${String(r.activities)} activities, ${String(r.links)} links\n` +
        `${row('as arrived', r.asArrived)}\n` +
        `${row('packed, no hint', r.packedNoHint)}\n` +
        `${row('packed + hint *', r.packedWithHint)}   <- what the product does today\n` +
        `     hint vs no hint:  lanes ${pct(r.packedNoHint.lanes, r.packedWithHint.lanes)}   ` +
        `mean ${pct(r.packedNoHint.meanDelta, r.packedWithHint.meanDelta)}   ` +
        `>5 ${pct(r.packedNoHint.overFive, r.packedWithHint.overFive)}\n` +
        `\n     LEVER 1 — reorder lane indices (zero lane cost):\n${vs('reordered', r.reordered)}\n` +
        `\n     LEVER 2 — do not pack the summaries the WBS band draws:\n` +
        (r.bandOnlyLanes === null
          ? ''
          : `     of the ${String(base.lanes)} shipped lanes, ${String(r.bandOnlyLanes)} hold NOTHING but ` +
            `band-drawn summaries\n     and therefore render EMPTY when the band is on ` +
            `(${String(r.bandOnlyLanes * 28)} px of blank rows at LANE_HEIGHT 28)\n`) +
        `${vs('2a scene only', r.sceneOnly)}\n` +
        `${vs('2b scene first', r.sceneFirst)}\n` +
        `\n     BOTH:\n${vs('2a + reordered', r.sceneOnlyReordered)}\n`,
    );
  }

  // The claim the packer's own docblock makes, checked rather than quoted.
  const bad = results.filter((r) => r.packedNoHint.lanes !== r.packedWithHint.lanes);
  console.log(
    bad.length === 0
      ? `  "Lane count is identical with the hint or without it, by construction"\n` +
          `  (pack-lanes.ts:45-48) HOLDS on every fixture measured.\n`
      : `  THAT CLAIM FAILS on ${bad.map((r) => r.fixture).join(', ')} — read pack-lanes.ts\n` +
          `  before relying on any lane figure in this epic.\n`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
