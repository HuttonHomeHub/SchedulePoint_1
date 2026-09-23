#!/usr/bin/env node
/**
 * **NetPoint-layout M0-T5 — FC-N6's baselines on today's row.**
 *
 *   node scripts/measure-netpoint-row.mjs
 *
 * Text collisions (dates off and on) and same-row glyph contacts, at 4 and 12 px/day, pitch 52 and
 * 60, on the four yardstick plans. The collision counter's control runs first and refuses a
 * verdict if two stacked labels do not count as one collision.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const out = mkdtempSync(join(tmpdir(), 'sp-netpoint-row-'));
const file = join(out, 'row.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/netpoint-row-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${file}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const src = readFileSync(file, 'utf8');
if ((src.match(/\bvar LANE_HEIGHT = \d+;/g) ?? []).length !== 1)
  throw new Error('INDETERMINATE: pitch');

console.log(
  `\n[NetPoint-layout M0-T5] ${new Date().toISOString()}, commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim().slice(0, 8)}\n`,
);
for (const pitch of [52, 60]) {
  const f = join(out, `row-${String(pitch)}.mjs`);
  writeFileSync(f, src.replace(/\bvar LANE_HEIGHT = \d+;/, `var LANE_HEIGHT = ${String(pitch)};`));
  const m = await import(pathToFileURL(f).href);
  const control = m.collisionControl();
  if (control.one !== 0 || control.two !== 1) {
    throw new Error(
      `INDETERMINATE: the collision control read ${JSON.stringify(control)}, expected one:0 two:1`,
    );
  }
  const chain = m.chainPlacedLayouts();
  const small = m.smallPlanLayouts();
  const u = m.unit300Layouts(FIXTURE, { rollUpSummaries: true });
  const s = m.scalePlan(2000);
  const plans = [
    ['chain-3 packed', chain.asap, chain.shipped],
    ['small-17', small.asap, small.shipped],
    ['Unit 300', u.asap, u.shipped],
    ['scale-2000 packed', s.asap, m.packedOnDrawn(s.asap, 'p')],
  ];
  console.log(
    `pitch ${String(pitch)} (control: 1 label → ${String(control.one)}, 2 stacked → ${String(control.two)})`,
  );
  for (const [name, asap, layout] of plans) {
    for (const pxPerDay of [4, 12]) {
      const ov = m.rectOverlaps(asap, layout, pxPerDay);
      console.log(
        `  ${name.padEnd(18)} ${String(pxPerDay).padStart(3)} px/d same-row drawn-rect overlaps ${String(ov.count)} (involving a milestone: ${String(ov.milestone)})`,
      );
      for (const r of m
        .rowReading(asap, layout, pxPerDay)
        .filter((x) => x.dates === 'on' || pxPerDay === 4)) {
        const share = r.adjacentPairs === 0 ? 0 : (100 * r.glyphContacts) / r.adjacentPairs;
        console.log(
          `  ${name.padEnd(18)} ${String(pxPerDay).padStart(3)} px/d dates ${r.dates.padEnd(3)}  text runs ${String(r.runs).padStart(5)}  collisions ${String(r.collisions).padStart(4)}  glyph contacts ${String(r.glyphContacts).padStart(4)} / ${String(r.adjacentPairs).padStart(4)} (${share.toFixed(1)} %; unlinked ${String(r.glyphContacts - r.linkedContacts).padStart(4)} = ${(r.adjacentPairs === 0 ? 0 : (100 * (r.glyphContacts - r.linkedContacts)) / r.adjacentPairs).toFixed(1)} %)${r.sample.length ? '  e.g. ' + r.sample.slice(0, 2).join('; ') : ''}`,
        );
        console.log(`JSON ${JSON.stringify({ pitch, plan: name, pxPerDay, ...r })}`);
      }
    }
  }
}
