#!/usr/bin/env node
/**
 * **Links-and-labels M0-T3 — the two-way-track prototype, judged twice. SCRATCH.**
 *
 *   node scripts/measure-two-way.mjs            (from apps/web)
 *   node scripts/measure-two-way.mjs --json
 *
 * For each attachment fixture at 1, 4 and 12 px/day, pan 32, four readings of `attachment-probe.ts`:
 *
 * 1. **shipped / shipped** — today's routes, today's judge (the M0 baseline).
 * 2. **shipped / amended** — today's routes, the draft amended judge. The control: every count must
 *    equal reading 1, because no end is offset yet; if any differs the amended judge is not a
 *    conservative extension and the script throws.
 * 3. **prototype / shipped** — `two-way-prototype.ts`'s split, today's judge: what the unamended
 *    judge makes of an offset end (spec §4.7 predicts: misread as an embed).
 * 4. **prototype / amended** — the same split, the draft amended judge.
 *
 * The prototype is harness-only (`two-way-prototype.ts` docblock); nothing here is the design.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const json = process.argv.includes('--json');
const out = mkdtempSync(join(tmpdir(), 'sp-two-way-'));
const entry = join(out, 'entry.ts');
const here = process.cwd();
writeFileSync(
  entry,
  `export { readAttachment, fixtures, selfTest } from ${JSON.stringify(`${here}/scripts/attachment-probe.ts`)};
export { splitTwoWayTracks, portOffsetBounds, PROTOTYPE_PORT_OFFSET_PX } from ${JSON.stringify(`${here}/scripts/two-way-prototype.ts`)};
`,
);
const bundle = join(out, 'probe.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const probe = await import(pathToFileURL(bundle).href);
probe.selfTest();
const delta = probe.PROTOTYPE_PORT_OFFSET_PX;
const amended = { kind: 'amended', portOffset: delta };
const COUNTS = [
  'unattachedEnds',
  'falseJunctions',
  'overlaps',
  'opposed',
  'textCrossings',
  'crossings',
  'foreignOccludedLinks',
  'bends',
];
const rows = [];
for (const fx of probe.fixtures(FIXTURE)) {
  for (const pxPerDay of [1, 4, 12]) {
    const view = { pxPerDay, originX: 40, originY: 32 };
    const size = fx.sizeAt(pxPerDay, 32);
    const splits = {};
    const transformFor = (sides) => (lines, frame) => {
      splits[sides] = probe.splitTwoWayTracks(
        fx.scene,
        view,
        lines,
        frame.workingWalk,
        delta,
        sides,
      );
      return splits[sides].lines;
    };
    const transform = transformFor('down-west');
    const base = probe.readAttachment(fx.scene, view, size);
    const baseAmended = probe.readAttachment(fx.scene, view, size, { judge: amended });
    for (const k of [...COUNTS, 'fingerprint']) {
      if (base[k] !== baseAmended[k]) {
        throw new Error(
          `${fx.name} @ ${pxPerDay}: the amended judge changes ${k} on unmoved routes ` +
            `(${base[k]} → ${baseAmended[k]}); it is not a conservative extension`,
        );
      }
    }
    const protoShipped = probe.readAttachment(fx.scene, view, size, { transform });
    const protoAmended = probe.readAttachment(fx.scene, view, size, { transform, judge: amended });
    const downEast = probe.readAttachment(fx.scene, view, size, {
      transform: transformFor('down-east'),
      judge: amended,
    });
    const fewest = probe.readAttachment(fx.scene, view, size, {
      transform: transformFor('fewest-crossings'),
      judge: amended,
    });
    const split = splits['down-west'];
    rows.push({
      fixture: fx.name,
      pxPerDay,
      split: { tracks: split.tracks, segments: split.segments, refused: split.refused },
      readings: { base, protoShipped, protoAmended, downEast, fewest },
    });
  }
}
if (json) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  const { lower, upper } = probe.portOffsetBounds();
  console.log(`PORT_OFFSET_PX window [${lower}, ${upper}]; prototype δ = ${delta}\n`);
  const pick = (r) => COUNTS.map((k) => String(r[k]).padStart(4)).join(' ');
  console.log(
    `${'fixture'.padEnd(20)} px/d reading       ${COUNTS.map((k) => k.slice(0, 4).padStart(4)).join(' ')}  reasons`,
  );
  for (const r of rows) {
    const s = r.split;
    for (const [name, x] of Object.entries(r.readings)) {
      console.log(
        `${r.fixture.padEnd(20)} ${String(r.pxPerDay).padStart(4)} ${name.padEnd(12)} ${pick(x)}  ${JSON.stringify(x.byReason)} ${JSON.stringify(x.endKinds)}`,
      );
    }
    console.log(
      `${''.padEnd(20)}      split: ${s.tracks} tracks, ${s.segments} segments, refused ${JSON.stringify(s.refused)}`,
    );
  }
}
