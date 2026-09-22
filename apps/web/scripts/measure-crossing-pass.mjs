#!/usr/bin/env node
/**
 * **logic-legibility M0-T3 — is Part C's own remedy a cause of the complaint?**
 *
 *   node scripts/measure-crossing-pass.mjs
 *
 * `chooseCorridorsByCrossing` bought ADR-0149 its headline −20.8 % on crossings. It moves an elbow
 * to candidates including `(from.x + to.x) / 2`, `to.x − gap` and offsets up to `± 8 × gap`, scores
 * them on **crossings only**, and checks bars in the **crossed lanes** only — which excludes both
 * endpoint lanes, where the two horizontal legs run. **Nothing checks the resulting legs.**
 *
 * (Named rather than cited by line: the three `link-routing.ts:8xx` citations this docblock carried
 * were accurate when M0 wrote them and pointed at `arrowhead()` by the time M3 landed ~300 lines
 * earlier in the file. The M6 component review found them. A line number in a script that outlives
 * the milestone that wrote it is a claim with a short shelf life and no gate — `check:claims` binds
 * only citations into DEPENDENCIES, so nothing here was ever going to fail.) A corridor moved far from its anchor lengthens
 * the leg, and a long leg is what meets a bar.
 *
 * So the pass is a candidate cause of a defect Part C never measured, and this measures it: the FC-L0
 * vector with the pass ON and OFF, same scene, same layout, same paint path.
 *
 * ## How OFF is produced, and why it is a bundle patch rather than a flag
 *
 * There is no seam. `paint.ts` calls the pass unconditionally inside the `scene.linkRouting`
 * branch, and adding a scene flag would be product code written to serve a measurement — the thing
 * ADR-0128 exists to refuse. Instead the harness bundles `crossing-probe.ts` once, then produces a
 * second bundle with that one call statement textually removed.
 *
 * **The control is that the removal is exact**: the call appears exactly once in the bundle, and the
 * script throws if it appears zero times or more than once. A patch that matched nothing would
 * silently measure the same code twice and report a flat zero delta — which reads as "the pass is
 * harmless", the most dangerous possible false result here.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const CALL = 'chooseCorridorsByCrossing(corridors, laneIndex, corridorGap(view));';

const out = mkdtempSync(join(tmpdir(), 'sp-xpass-'));
const onBundle = join(out, 'probe-on.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/crossing-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${onBundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

const source = readFileSync(onBundle, 'utf8');
const occurrences = source.split(CALL).length - 1;
if (occurrences !== 1) {
  throw new Error(
    `INDETERMINATE: the call to remove appears ${occurrences} times in the bundle, not once. ` +
      `A patch that matches nothing measures the same code twice and reports a flat zero, which ` +
      `reads as "the pass is harmless". Refusing to judge.`,
  );
}
const offBundle = join(out, 'probe-off.mjs');
writeFileSync(offBundle, source.replace(CALL, '/* chooseCorridorsByCrossing REMOVED (M0-T3) */'));

const on = await import(pathToFileURL(onBundle).href);
const off = await import(pathToFileURL(offBundle).href);

const { asap, shipped } = on.unit300Layouts(FIXTURE, { rollUpSummaries: true });
const offLayouts = off.unit300Layouts(FIXTURE, { rollUpSummaries: true });

console.log(`\n[logic-legibility M0-T3] node, ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log(
  `  Unit 300 — ${String(asap.activities.length)} activities, WBS band OFF, shipped layout`,
);
console.log(`  chooseCorridorsByCrossing ON (as shipped) against the same paint with it removed\n`);
console.log(
  `    ${'zoom'.padStart(5)} ${'pass'.padStart(5)} ${'links'.padStart(5)} ${'occl/link'.padStart(9)} ` +
    `${'x/link'.padStart(6)} ${'foreign'.padStart(7)} ${'2pt f/all'.padStart(9)} ${'buried px'.padStart(10)} ` +
    `${'fingerprint'.padStart(12)}`,
);

const rows = [];
for (const pxPerDay of [1, 4, 12]) {
  for (const [label, mod, layout] of [
    ['ON', on, shipped],
    ['OFF', off, offLayouts.shipped],
  ]) {
    const r = mod.readBoth(asap, layout, pxPerDay, 32);
    rows.push({ pxPerDay, pass: label, ...r });
    console.log(
      `    ${String(pxPerDay).padStart(5)} ${label.padStart(5)} ${String(r.visibleLinks).padStart(5)} ` +
        `${(r.foreignLinks / r.visibleLinks).toFixed(3).padStart(9)} ${r.perLink.toFixed(3).padStart(6)} ` +
        `${String(r.foreign).padStart(7)} ${`${String(r.twoPointForeign)}/${String(r.twoPointLinks)}`.padStart(9)} ` +
        `${Math.round(r.buriedPx).toLocaleString('en-GB').padStart(10)} ${r.fingerprint.padStart(12)}`,
    );
  }
}

// **The second control: the two bundles must actually draw different pictures.** Identical
// fingerprints would mean the patch removed a call that changes nothing on this plan, and every
// delta below would be a true zero about the wrong thing.
for (const pxPerDay of [1, 4, 12]) {
  const a = rows.find((r) => r.pxPerDay === pxPerDay && r.pass === 'ON');
  const b = rows.find((r) => r.pxPerDay === pxPerDay && r.pass === 'OFF');
  if (a.fingerprint === b.fingerprint) {
    throw new Error(
      `INDETERMINATE: ON and OFF paint an identical picture at ${pxPerDay} px/day ` +
        `(${a.fingerprint}). The patch changed nothing. Refusing to judge.`,
    );
  }
}

console.log('');
for (const pxPerDay of [1, 4, 12]) {
  const a = rows.find((r) => r.pxPerDay === pxPerDay && r.pass === 'ON');
  const b = rows.find((r) => r.pxPerDay === pxPerDay && r.pass === 'OFF');
  const rel = (x, y) => (x === 0 ? 0 : ((y - x) / x) * 100);
  const occOn = a.foreignLinks / a.visibleLinks;
  const occOff = b.foreignLinks / b.visibleLinks;
  const dOcc = rel(occOff, occOn);
  const dX = rel(b.perLink, a.perLink);
  console.log(
    `  ${String(pxPerDay).padStart(2)} px/day: turning the pass ON moves occl/link ` +
      `${dOcc >= 0 ? '+' : ''}${dOcc.toFixed(1)}% (${occOff.toFixed(3)} → ${occOn.toFixed(3)}) ` +
      `and x/link ${dX >= 0 ? '+' : ''}${dX.toFixed(1)}% (${b.perLink.toFixed(3)} → ${a.perLink.toFixed(3)})`,
  );
}
console.log(
  '\n  If the pass RAISES occlusion, ADR-0149 bought its crossing reduction partly with the\n' +
    "  quantity the product owner was complaining about, and FC-L4's amendment makes applying M2's\n" +
    "  leg viability to this pass's candidate filter MANDATORY rather than conditional.\n",
);
