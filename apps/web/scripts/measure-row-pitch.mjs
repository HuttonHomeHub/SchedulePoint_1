#!/usr/bin/env node
/**
 * **M3-T4 — what pitch does the row need, and what does it hand back?** (FC-L3, FC-L11)
 *
 *   node scripts/measure-row-pitch.mjs
 *
 * M3-T3 built the row at a **provisional** pitch. This measures the candidates and takes FC-L3's
 * verdict — the epic's, not M1-T4's progress reading — at the geometry that ships.
 *
 * ## What FC-L11 forbids, and why every row here carries two band figures
 *
 * Thinning the bar hands vertical space back; moving the name above it and the dates below spends
 * some of that space. The **gross** figure (`LANE_HEIGHT - BAR_HEIGHT`, the _"~57 % of every row
 * handed back"_ arithmetic) may not appear in any document without the **net** beside it — what a
 * channel may actually use once the row's text rows have taken theirs. Both are printed on every
 * line, so the two can never be quoted apart.
 *
 * **FC-L11's withdrawal clause**: if the net gain is smaller than today's 10 px, the row treatment
 * has spent the channel it was also supposed to supply, and the trade goes to the product owner
 * with both rendered.
 *
 * ## How the pitch is varied
 *
 * M-C0-T4's method, unchanged: the **bundle** is rewritten rather than a tracked file, so nothing
 * in the repository is modified for the length of the run and no `finally` can be skipped by a
 * crash. The substitution asserts exactly one match and every variant reports the pitch it painted
 * with, so a substitution that silently failed shows up as a reading at the wrong pitch.
 *
 * **`BAR_PAD` is a live expression over that binding** (`var BAR_PAD = (LANE_HEIGHT - BAR_HEIGHT) /
 * 2;` in the emitted bundle — verified, not assumed), so one substitution moves the pad, the row
 * slots, the channel capacity and the hit rect together. That is what makes a one-line sweep honest
 * after M3-T3 made so much depend on the pitch.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
/** Band off, lanes arranged — the configuration a planner meets (decision 7). */
const ROLL_UP = { rollUpSummaries: true };
const ZOOMS = [4, 12];
/**
 * The candidates, and why the list starts where it does.
 *
 * A text line needs `LABEL_LINE_H` (14) plus its gap, above and below, so `rowReservesTextRows()`
 * is false below a pitch of 37 and the treatment is not buildable there at all — 28, what shipped
 * before this epic, is not a candidate for a row that carries text. 68 is the reference's own row.
 */
const PITCHES = [40, 44, 48, 52, 56, 60, 68];
/** Today's net band, and FC-L11's floor. */
const TODAY_BAND_PX = 10;
/**
 * The zooms the epic's occlusion and crossing figures have always been taken at, so this reading
 * can be set beside M2's without a conversion. M2 band-off on Unit 300 recorded `occl/link`
 * 0.404 / 0.250 / 0.229 and `x/link` 2.399 / 1.840 / 1.835 at 1 / 4 / 12 px per day
 * (`docs/specs/logic-legibility/m2-leg-obstacles.md` sections 2.1 and 4).
 */
const WHOLE_PLAN_ZOOMS = [1, 4, 12];
/**
 * **The prediction, committed before the sweep ran** (spec section 0.10).
 *
 * Thinning the bar must do **nothing** for occlusion, because a horizontal leg runs at the bar's
 * **centre-line** — so whether a leg meets a bar is an x-overlap question that the bar's HEIGHT
 * does not enter. If `occl/link` moves here, either the claim is wrong or the row treatment has
 * changed something nobody costed, and either is a finding rather than a number to report.
 *
 * Crossings are NOT predicted constant: `packGutterChannels` gets more channels as the pitch
 * grows, and moving a corridor to a different y is exactly the sort of thing that changes which
 * pairs cross.
 */
const M2_OCCL_PER_LINK = { 1: 0.404, 4: 0.25, 12: 0.229 };

const out = mkdtempSync(join(tmpdir(), 'sp-row-pitch-'));

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

/** One textual substitution, asserted unique — a silent miss would grade the shipped pitch twice. */
const atPitch = (source, pitch) => {
  const pattern = /\bvar LANE_HEIGHT = \d+;/g;
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `M3-T4 INDETERMINATE: expected exactly one \`var LANE_HEIGHT = N;\` in the bundle and found ` +
        `${matches.length}. esbuild's output shape has changed — the sweep would silently grade ` +
        `one pitch at every step. Refusing to measure.`,
    );
  }
  if (!/var BAR_PAD = \(LANE_HEIGHT - BAR_HEIGHT\) \/ 2;/.test(source)) {
    throw new Error(
      'M3-T4 INDETERMINATE: `BAR_PAD` is not a live expression over `LANE_HEIGHT` in the bundle, ' +
        'so esbuild has folded it. Every row-slot, channel and hit-rect figure below would be ' +
        "the shipped pitch's wearing another pitch's label. Refusing to measure.",
    );
  }
  return source.replace(pattern, `var LANE_HEIGHT = ${String(pitch)};`);
};

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[logic-legibility M3-T4 / FC-L3 + FC-L11] node, ${new Date().toISOString()}`);
console.log(`  commit   ${commit}`);
console.log(`  fixture  p6_torture_test_v1.xer — "Unit 300 Amine", band off, lanes arranged\n`);

const rows = [];
/** One whole-plan reading per pitch per zoom: crossings and occlusion from the same paint. */
const whole = [];
for (const pitch of PITCHES) {
  const file = join(out, `probe-${String(pitch)}.mjs`);
  writeFileSync(file, atPitch(bundle, pitch));
  const probe = await import(pathToFileURL(file).href);
  for (const r of probe.gutterReadings(FIXTURE, ZOOMS, ROLL_UP)) {
    if (r.laneHeight !== pitch) {
      throw new Error(
        `M3-T4 INDETERMINATE: asked for pitch ${String(pitch)} and the painter reported ` +
          `${String(r.laneHeight)}. The substitution did not take. Refusing to measure.`,
      );
    }
    rows.push(r);
  }

  // **`unit300Layouts(...).shipped`, which is what `measure-crossing-pass.mjs` reads** — not the
  // band-off config `gutterReadings` picks. They are the same arrangement, but the M2 figures this
  // is compared against were taken through that entry point, and a comparison against a recorded
  // number is only worth anything if it enters the harness the same way.
  const { asap, shipped } = probe.unit300Layouts(FIXTURE, ROLL_UP);
  for (const pxPerDay of WHOLE_PLAN_ZOOMS) {
    const r = probe.readBoth(asap, shipped, pxPerDay, 32);
    whole.push({ pitch, pxPerDay, ...r });
  }
}

// ---- the control: a sweep needs something to sweep ----
if (rows.every((r) => r.gutterLegs === 0)) {
  throw new Error(
    'M3-T4 INDETERMINATE: no pitch produced a single gutter leg, so this run measures nothing ' +
      'about the gutter. Refusing to judge.',
  );
}
/**
 * The second control, and it exists because its absence is a recorded defect.
 *
 * `gutterReadings` used to find legs by a datum M1-T1 had moved, so it reported **0 legs from 103
 * six-point routes** — and `legsTouchingABar: 0` with it, which reads as a triumph. The
 * whole-sweep control above only fires when EVERY pitch is empty, so a sweep in which one pitch
 * happened to work would have graded the rest on nothing. This one is per-pitch.
 */
for (const r of rows) {
  if (r.vhvRoutes > 0 && r.gutterLegs === 0) {
    throw new Error(
      `M3-T4 INDETERMINATE: at pitch ${String(r.laneHeight)} / ${String(r.pxPerDay)} px per day, ` +
        `${String(r.vhvRoutes)} six-point routes were painted and no gutter leg was found. ` +
        'Refusing to judge.',
    );
  }
}

console.log(
  `    ${'pitch'.padStart(5)} ${'px/d'.padStart(4)} ${'gross'.padStart(5)} ${'NET'.padStart(4)} ` +
    `${'chan'.padStart(4)} ${'legs'.padStart(4)} ${'y'.padStart(3)} ${'max/y'.padStart(5)} ` +
    `${'ovl/y'.padStart(5)} ${'peak'.padStart(4)} ${'on a bar'.padStart(8)} ${'clear'.padStart(5)}`,
);
for (const r of rows) {
  console.log(
    `    ${String(r.laneHeight).padStart(5)} ${String(r.pxPerDay).padStart(4)} ` +
      `${String(r.grossBandPx).padStart(5)} ${String(r.clearBandPx).padStart(4)} ` +
      `${String(r.channels).padStart(4)} ${String(r.gutterLegs).padStart(4)} ` +
      `${String(r.distinctGutterY).padStart(3)} ${String(r.maxLegsOnOneY).padStart(5)} ` +
      `${String(r.maxOverlappingOnOneY).padStart(5)} ${String(r.peakGutterOverlap).padStart(4)} ` +
      `${String(r.legsTouchingABar).padStart(8)} ${r.minClearancePx.toFixed(1).padStart(5)}`,
  );
}

console.log('\n  FC-L11 — the NET gain, never the gross alone\n');
for (const pitch of PITCHES) {
  const at = rows.filter((r) => r.laneHeight === pitch);
  const net = at[0].clearBandPx;
  const gross = at[0].grossBandPx;
  const verdict = net >= TODAY_BAND_PX ? 'clears' : 'FAILS';
  console.log(
    `    pitch ${String(pitch).padStart(2)}  gross ${String(gross).padStart(2)} px  ->  ` +
      `net ${String(net).padStart(2)} px (${String(at[0].channels)} channels)  ` +
      `${verdict} the ${String(TODAY_BAND_PX)} px floor`,
  );
}

console.log('\n  FC-L3, first limb — no channel enters a bar\n');
for (const pitch of PITCHES) {
  const at = rows.filter((r) => r.laneHeight === pitch);
  const touching = Math.max(...at.map((r) => r.legsTouchingABar));
  const clear = Math.min(...at.map((r) => r.minClearancePx));
  console.log(
    `    pitch ${String(pitch).padStart(2)}  legs inside a painted bar: ${String(touching)}  ·  ` +
      `smallest gap to a bar edge: ${clear.toFixed(1)} px`,
  );
}

console.log('\n  FC-L3, second limb — max legs on one y <= ceil(peak overlap / channels)\n');
console.log(
  '    Reported BOTH ways, as `gutterStats` records: the literal bound counts every leg sharing\n' +
    '    a y, and a channel legitimately carries many runs that do not overlap in x — which is\n' +
    '    what packing by x-interval is FOR. The overlapping count is what the limb is about.\n',
);
for (const pitch of PITCHES) {
  const at = rows.filter((r) => r.laneHeight === pitch);
  for (const r of at) {
    const bound = Math.ceil(r.peakGutterOverlap / Math.max(1, r.channels));
    const literal = r.maxLegsOnOneY <= bound ? 'meets' : 'FAILS';
    const meaningful = r.maxOverlappingOnOneY <= bound ? 'meets' : 'FAILS';
    console.log(
      `    pitch ${String(pitch).padStart(2)} @ ${String(r.pxPerDay).padStart(2)} px/d  ` +
        `bound ceil(${String(r.peakGutterOverlap)}/${String(r.channels)}) = ${String(bound)}  ·  ` +
        `literal ${String(r.maxLegsOnOneY)} ${literal}  ·  ` +
        `overlapping ${String(r.maxOverlappingOnOneY)} ${meaningful}`,
    );
  }
}

console.log('\n  The whole plan, at each pitch — crossings and occlusion from one paint\n');
console.log(
  `    ${'pitch'.padStart(5)} ${'px/d'.padStart(4)} ${'links'.padStart(5)} ` +
    `${'occl/link'.padStart(9)} ${'x/link'.padStart(6)} ${'foreign'.padStart(7)} ` +
    `${'2pt f/all'.padStart(9)} ${'buried px'.padStart(10)} ${'fingerprint'.padStart(12)}`,
);
for (const r of whole) {
  console.log(
    `    ${String(r.pitch).padStart(5)} ${String(r.pxPerDay).padStart(4)} ` +
      `${String(r.visibleLinks).padStart(5)} ` +
      `${(r.foreignLinks / r.visibleLinks).toFixed(3).padStart(9)} ` +
      `${r.perLink.toFixed(3).padStart(6)} ${String(r.foreign).padStart(7)} ` +
      `${`${String(r.twoPointForeign)}/${String(r.twoPointLinks)}`.padStart(9)} ` +
      `${Math.round(r.buriedPx).toLocaleString('en-GB').padStart(10)} ` +
      `${r.fingerprint.padStart(12)}`,
  );
}

console.log(
  "\n  The prediction, committed before this ran: the bar's HEIGHT does not enter occlusion\n",
);
for (const pxPerDay of WHOLE_PLAN_ZOOMS) {
  const at = whole.filter((r) => r.pxPerDay === pxPerDay);
  const values = at.map((r) => r.foreignLinks / r.visibleLinks);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const m2 = M2_OCCL_PER_LINK[pxPerDay];
  const flat =
    hi - lo < 0.0005 ? 'CONSTANT across every pitch' : `MOVES: ${lo.toFixed(3)}..${hi.toFixed(3)}`;
  console.log(
    `    ${String(pxPerDay).padStart(2)} px/day  M2 recorded ${m2.toFixed(3)}  ->  ` +
      `this sweep ${lo.toFixed(3)}  ·  ${flat}`,
  );
}

console.log('\n  What each extra 4 px of row buys — the pitch decision, read off the sweep\n');
let previous = null;
for (const pitch of PITCHES) {
  const at = rows.filter((r) => r.laneHeight === pitch);
  const x = whole.filter((r) => r.pitch === pitch && r.pxPerDay === 4)[0];
  const bunching = Math.max(...at.map((r) => r.maxOverlappingOnOneY));
  const line =
    `    pitch ${String(pitch).padStart(2)}  net ${String(at[0].clearBandPx).padStart(2)} px  ` +
    `${String(at[0].channels)} channels  ·  worst overlapping-on-one-y ${String(bunching)}  ·  ` +
    `x/link ${x.perLink.toFixed(3)}  ·  occl/link ${(x.foreignLinks / x.visibleLinks).toFixed(3)}`;
  const delta =
    previous === null
      ? ''
      : bunching === previous.bunching && at[0].channels === previous.channels
        ? '   <- buys NOTHING over the pitch above'
        : '';
  console.log(line + delta);
  previous = { bunching, channels: at[0].channels };
}

/**
 * **The prediction's own subject, measured directly** (spec section 0.10).
 *
 * The sweep above holds `BAR_HEIGHT` at 5 and varies the pitch, so its invariance establishes
 * something real but not quite the claim: it says **where a leg runs vertically** does not enter
 * occlusion, which follows from the pipeline order (`routeOrthogonal` -> `chooseCorridorsByCrossing`
 * moves a corridor's **x** -> `packGutterChannels` moves only its **y**, `paint.ts:1206-1271`) and
 * from `legsTouchingABar: 0` at every pitch. The claim is about the bar's **height**. So vary that
 * instead, at one pitch, and see whether the figure moves.
 */
const BAR_HEIGHTS = [5, 10, 18];
const AT_PITCH = 52;
const barSweep = [];
for (const barHeight of BAR_HEIGHTS) {
  const file = join(out, `probe-bar-${String(barHeight)}.mjs`);
  let source = atPitch(bundle, AT_PITCH);
  const pattern = /\bvar BAR_HEIGHT = \d+;/g;
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `M3-T4 INDETERMINATE: expected exactly one \`var BAR_HEIGHT = N;\` and found ` +
        `${String(matches.length)}. Refusing to measure.`,
    );
  }
  writeFileSync(file, source.replace(pattern, `var BAR_HEIGHT = ${String(barHeight)};`));
  const probe = await import(pathToFileURL(file).href);
  const { asap, shipped } = probe.unit300Layouts(FIXTURE, ROLL_UP);
  for (const pxPerDay of WHOLE_PLAN_ZOOMS) {
    barSweep.push({ barHeight, pxPerDay, ...probe.readBoth(asap, shipped, pxPerDay, 32) });
  }
}

console.log(`\n  Does the bar's HEIGHT enter occlusion? (pitch held at ${String(AT_PITCH)})\n`);
console.log(
  `    ${'bar'.padStart(4)} ${'px/d'.padStart(4)} ${'occl/link'.padStart(9)} ` +
    `${'x/link'.padStart(6)} ${'foreign'.padStart(7)} ${'2pt f/all'.padStart(9)} ` +
    `${'buried px'.padStart(10)} ${'fingerprint'.padStart(12)}`,
);
for (const r of barSweep) {
  console.log(
    `    ${String(r.barHeight).padStart(4)} ${String(r.pxPerDay).padStart(4)} ` +
      `${(r.foreignLinks / r.visibleLinks).toFixed(3).padStart(9)} ` +
      `${r.perLink.toFixed(3).padStart(6)} ${String(r.foreign).padStart(7)} ` +
      `${`${String(r.twoPointForeign)}/${String(r.twoPointLinks)}`.padStart(9)} ` +
      `${Math.round(r.buriedPx).toLocaleString('en-GB').padStart(10)} ${r.fingerprint.padStart(12)}`,
  );
}

console.log('\n  FC-L7 — what the pitch costs the deliverable, the overview and the window\n');
console.log(
  `    ${'pitch'.padStart(5)} ${'px/d'.padStart(4)} ${'lanes'.padStart(5)} ` +
    `${'export CSS'.padStart(12)} ${'raster @1.75'.padStart(14)} ${'scaled'.padStart(6)} ` +
    `${'px/lane'.padStart(7)} ${'vis lanes'.padStart(9)} ${'window h'.padStart(8)}`,
);
for (const pitch of [28, ...PITCHES]) {
  const file = join(out, `probe-cost-${String(pitch)}.mjs`);
  writeFileSync(file, atPitch(bundle, pitch));
  const probe = await import(pathToFileURL(file).href);
  for (const r of [
    ...probe.rowCosts(FIXTURE, [4], ROLL_UP),
    ...probe.rowCosts(FIXTURE, [4], { ...ROLL_UP, scaleTo: 2000 }),
  ]) {
    console.log(
      `    ${String(r.laneHeight).padStart(5)} ${String(r.pxPerDay).padStart(4)} ` +
        `${String(r.lanes).padStart(5)} ` +
        `${`${String(r.exportWidth)}x${String(r.exportHeight)}`.padStart(12)} ` +
        `${`${String(r.rasterWidth)}x${String(r.rasterHeight)}`.padStart(14)} ` +
        `${(r.scaledToFit ? 'YES' : 'no').padStart(6)} ` +
        `${r.pxPerLane.toFixed(3).padStart(7)} ${r.visibleLanes.toFixed(1).padStart(9)} ` +
        `${r.windowRectHeight.toFixed(1).padStart(8)}`,
    );
  }
}

console.log(
  '\n  FC-L7 said the export is "the condition most likely to bind". Which term binds it?\n',
);
for (const pitch of [28, 52, 68]) {
  const file = join(out, `probe-bind-${String(pitch)}.mjs`);
  writeFileSync(file, atPitch(bundle, pitch));
  const probe = await import(pathToFileURL(file).href);
  for (const r of probe.rowCosts(FIXTURE, [1, 4, 12], { ...ROLL_UP, scaleTo: 2000 })) {
    console.log(
      `    pitch ${String(r.laneHeight).padStart(2)} @ ${String(r.pxPerDay).padStart(2)} px/d  ` +
        `raster ${String(r.rasterWidth)}x${String(r.rasterHeight)}  ` +
        `${r.scaledToFit ? 'SCALED TO FIT' : 'inside the cap'}`,
    );
  }
}

console.log('\n  So the pitch does not bind the export. How many lanes would?\n');
{
  const file = join(out, 'probe-headroom.mjs');
  writeFileSync(file, atPitch(bundle, 52));
  const probe = await import(pathToFileURL(file).href);
  // Reserved chrome + padding, derived from a measured reading rather than restated from the
  // export module's constants: height = reserved + lanes * pitch + 2 * padding.
  const [r] = probe.rowCosts(FIXTURE, [4], ROLL_UP);
  const chrome = r.exportHeight - r.lanes * r.laneHeight;
  const capCss = 8192 / 1.75;
  console.log(
    `    reserved chrome + padding, measured: ${String(chrome)} px  ·  ` +
      `cap at dpr 1.75: ${capCss.toFixed(0)} CSS px`,
  );
  for (const pitch of [28, 52, 68]) {
    console.log(
      `    pitch ${String(pitch).padStart(2)}  the height cap binds at ` +
        `${String(Math.floor((capCss - chrome) / pitch))} lanes`,
    );
  }
}
