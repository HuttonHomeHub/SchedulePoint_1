#!/usr/bin/env node
/**
 * **NetPoint-layout M0-T2 — the baseline vector on the four yardstick plans, at pitch 52 and 60.**
 *
 *   node scripts/measure-netpoint-baseline.mjs
 *
 * `conditions.md` fixes every bar before this runs. This produces the denominators those bars are
 * formulas over: FC-N4's pitch-60 `packLanes` baseline, FC-N9's B_X(60), and the start point every
 * later milestone is compared against.
 *
 * ## The four plans (spec §5's yardstick)
 *
 *   - `chain-3-placed`  the reported defect (`chain-placed-fixture.ts`): measured under the PRE-fix
 *                       pack as well as the fixed one, so the fixture's point is visible in numbers.
 *   - `small-17`        `small-plan-fixture.ts`, packed.
 *   - `Unit 300`        `p6_torture_test_v1.xer`, band off, lanes arranged — entered through
 *                       `unit300Layouts(...).shipped`, the entry the logic-legibility figures used,
 *                       so they can be set beside this at pitch 52.
 *   - `scale-2000`      `scaleScene(2000)` (2,160 bars incl. summaries), packed on its drawn spans —
 *                       what Arrange would do to it. The generator's own lanes are reported too.
 *
 * ## The columns
 *
 *   rows      lanes the layout uses          overlaps  same-row DRAWN-span overlaps (FC-N1's count)
 *   occl      links with a foreign-occluded leg (a leg behind a bar it does not connect to)
 *   occl/lk   occl per drawn link           x/link    link-versus-link crossings per drawn link
 *   sameRow   links whose ends share a lane (by layout)   travel  Σ |Δlane| over links
 *   stack/y   worst gutter legs overlapping in x on one y (ADR-0151's "stacked lines")
 *
 * ## Controls, each of which throws rather than printing a number that measures nothing
 *
 *   - the pitch substitution is asserted unique in the bundle, and every reading reports the pitch
 *     the painter actually used (`laneHeight`) — a substitution that did not take is refused;
 *   - every link must be drawn (`visibleLinks === links`), because a reading over part of a plan is
 *     the "rewarding a layout for culling the evidence" failure `measure-occlusion.mjs` records;
 *   - `chain-3-placed` must show ≥ 1 overlap under the pre-fix pack and 0 under the fixed one
 *     (the fixture checks this itself, and it is re-checked here on the numbers printed).
 *
 * Pans are positive for the reason `measure-occlusion.mjs` gives: a negative pan culls lanes off the
 * top and the vacuity control would refuse it. They are swept to ESTABLISH pan invariance, and the
 * run says whether it held.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const ROLL_UP = { rollUpSummaries: true };
const PITCHES = [52, 60];
const ZOOMS = [1, 4, 12];
const PANS = [0, 32, 200, 500];

const out = mkdtempSync(join(tmpdir(), 'sp-netpoint-'));
const bundle = (() => {
  const file = join(out, 'probe.mjs');
  execFileSync(
    'pnpm',
    [
      'exec',
      'esbuild',
      'scripts/crossing-probe.ts',
      '--bundle',
      '--format=esm',
      '--platform=node',
      `--outfile=${file}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit' },
  );
  return readFileSync(file, 'utf8');
})();

/** `measure-row-pitch.mjs`'s substitution, unchanged: one match asserted, BAR_PAD asserted live. */
const atPitch = (source, pitch) => {
  const pattern = /\bvar LANE_HEIGHT = \d+;/g;
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `M0-T2 INDETERMINATE: expected one \`var LANE_HEIGHT = N;\` in the bundle, found ${String(matches.length)}.`,
    );
  }
  if (!/var BAR_PAD = \(LANE_HEIGHT - BAR_HEIGHT\) \/ 2;/.test(source)) {
    throw new Error('M0-T2 INDETERMINATE: BAR_PAD is not a live expression over LANE_HEIGHT.');
  }
  return source.replace(pattern, `var LANE_HEIGHT = ${String(pitch)};`);
};

const travelOf = (layout, deps) =>
  deps.reduce(
    (sum, d) =>
      sum +
      Math.abs(
        (layout.laneOf.get(d.predecessorKey) ?? 0) - (layout.laneOf.get(d.successorKey) ?? 0),
      ),
    0,
  );

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[NetPoint-layout M0-T2] node, ${new Date().toISOString()}`);
console.log(`  commit   ${commit}\n`);

const readings = [];
for (const pitch of PITCHES) {
  const file = join(out, `probe-${String(pitch)}.mjs`);
  writeFileSync(file, atPitch(bundle, pitch));
  const probe = await import(pathToFileURL(file).href);

  const chain = probe.chainPlacedLayouts();
  const small = probe.smallPlanLayouts();
  const unit = probe.unit300Layouts(FIXTURE, ROLL_UP);
  const scale = probe.scalePlan(2000);
  const plans = [
    { plan: 'chain-3-placed', asap: chain.asap, layout: chain.prefix, tag: 'pre-fix' },
    { plan: 'chain-3-placed', asap: chain.asap, layout: chain.shipped, tag: 'packed' },
    { plan: 'small-17', asap: small.asap, layout: small.shipped, tag: 'packed' },
    { plan: 'Unit 300', asap: unit.asap, layout: unit.shipped, tag: 'packed' },
    { plan: 'scale-2000', asap: scale.asap, layout: scale.generator, tag: 'generator' },
    {
      plan: 'scale-2000',
      asap: scale.asap,
      layout: probe.packedOnDrawn(scale.asap, 'scale-2000 (packed on drawn)'),
      tag: 'packed',
    },
  ];

  for (const { plan, asap, layout, tag } of plans) {
    const deps = asap.dependencies;
    const overlaps = probe.drawnOverlaps(layout.laneOf, asap.start, asap.finish);
    const travel = travelOf(layout, deps);
    for (const pxPerDay of ZOOMS) {
      for (const originY of PANS) {
        const r = probe.readVector(asap, layout, pxPerDay, originY);
        if (r.laneHeight !== pitch) {
          throw new Error(
            `M0-T2 INDETERMINATE: asked for pitch ${String(pitch)}, painter used ${String(r.laneHeight)}.`,
          );
        }
        if (r.visibleLinks !== deps.length) {
          throw new Error(
            `M0-T2 INDETERMINATE: ${plan} (${tag}) at ${String(pxPerDay)} px/day, pan ${String(originY)} ` +
              `drew ${String(r.visibleLinks)} of ${String(deps.length)} links. A reading over part of ` +
              'the plan is refused.',
          );
        }
        readings.push({ pitch, plan, tag, pxPerDay, originY, overlaps, travel, ...r });
      }
    }
  }
}

// ---- the fixture control, on the printed numbers ----
for (const pitch of PITCHES) {
  const pre = readings.find(
    (r) => r.pitch === pitch && r.plan === 'chain-3-placed' && r.tag === 'pre-fix',
  );
  const post = readings.find(
    (r) => r.pitch === pitch && r.plan === 'chain-3-placed' && r.tag === 'packed',
  );
  if (!pre || !post || pre.overlaps < 1 || post.overlaps !== 0) {
    throw new Error(
      'M0-T2 INDETERMINATE: chain-3-placed does not show the defect on the printed numbers.',
    );
  }
}

// ---- pan invariance: established, not assumed ----
const panDrift = [];
for (const key of new Set(readings.map((r) => `${r.pitch}|${r.plan}|${r.tag}|${r.pxPerDay}`))) {
  const group = readings.filter((r) => `${r.pitch}|${r.plan}|${r.tag}|${r.pxPerDay}` === key);
  const fields = ['foreignLinks', 'crossings', 'maxOverlappingOnOneY'];
  for (const f of fields) {
    const values = new Set(group.map((r) => r[f]));
    if (values.size > 1) panDrift.push(`${key} ${f}: ${[...values].join(' / ')}`);
  }
}

const pad = (v, n) => String(v).padStart(n);
console.log(
  'pitch plan            layout      px/d  rows overlaps  occl  occl/lk  x/link  sameRow  travel  stack/y',
);
for (const r of readings.filter((x) => x.originY === 32)) {
  console.log(
    `${pad(r.pitch, 5)} ${r.plan.padEnd(15)} ${r.tag.padEnd(10)} ${pad(r.pxPerDay, 5)} ${pad(r.lanes, 5)} ` +
      `${pad(r.overlaps, 8)} ${pad(r.foreignLinks, 5)} ${pad(r.occlPerLink.toFixed(3), 8)} ` +
      `${pad(r.perLink.toFixed(3), 7)} ${pad(r.sameRowByLane, 8)} ${pad(r.travel, 7)} ` +
      `${pad(r.maxOverlappingOnOneY, 8)}`,
  );
}
console.log(
  panDrift.length === 0
    ? `\npan invariance HELD: every figure above is identical at pans ${PANS.join(', ')}.`
    : `\npan invariance DID NOT hold (${String(panDrift.length)} cases):\n  ${panDrift.join('\n  ')}`,
);
console.log(`\n${String(readings.length)} readings, every link drawn in every one.`);
