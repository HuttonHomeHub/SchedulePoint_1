#!/usr/bin/env node
/**
 * **M4 — does any assignment rule earn its place on the VECTOR?** (logic-legibility, FC-L6)
 *
 *   node scripts/measure-assignment-vector.mjs
 *
 * ADR-0149 D5 measured three of these rules and rejected all three — **on link-versus-link
 * crossings alone**, which was the only metric that existed then. FC-L6 judges on three:
 *
 * > A candidate is **offered to the product owner** only if it improves **at least one** of
 * > `occl/link`, `x/link`, mean |Δlane| by **≥ 20 %** while worsening **none** of the three by more
 * > than **10 %**. Height is reported and does not disqualify (decision 2).
 *
 * The rule is encoded here, not applied by eye, so the verdict cannot drift with whoever reads the
 * table. Where 20 % comes from — and why it is deliberately not FC-C2's 50 % — is in
 * `conditions.md` under FC-L6, written before this ran.
 *
 * ## Chain rows is measured FIRST, and reported as a decomposition
 *
 * The NetPoint reference chains sequential activities along one row, so chain rows is **the
 * reference's own shape** — and D5's worst candidate. FC-L6's amendment names two mechanical
 * hypotheses that pull opposite ways, and requires both to be reported, because **a measurement
 * framed only by H1 would find H1**:
 *
 * - **H1** — a chain on one row needs no traversal, so its links should be occlusion-free.
 * - **H2** — a chain on one row puts more bars in that row, and occlusion is a leg meeting a bar in
 *   its own lane, so every link _out_ of the chain has a leg in a crowded row.
 *
 * `readVector` splits by geometry (a polyline whose first and last point share a y is a same-row
 * link — `routeOrthogonal`'s own condition), and refuses to report at all if the two buckets do not
 * sum to the aggregate.
 *
 * ## Why whole-plan
 *
 * M-C0-T2b's recorded error: a framing that culls hands the win to whichever layout shows less of
 * the plan at a time, and these candidates differ in height **by design**. Every reading is
 * whole-plan and the link-population control runs before any number is printed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
/** FC-L6, verbatim. */
const IMPROVE = 0.2;
const WORSEN = 0.1;

const out = mkdtempSync(join(tmpdir(), 'sp-vector-'));
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
const { assignmentCandidates, readVector } = await import(pathToFileURL(bundle).href);

const { asap, shipped, candidates } = assignmentCandidates(FIXTURE);
const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(`\n[logic-legibility M4 / FC-L6] node, ${new Date().toISOString()}`);
console.log(`  commit  ${commit}`);
console.log(`  fixture p6_torture_test_v1.xer — "Unit 300 Amine", band off, whole plan, 4 px/day`);
console.log(
  `  rule    offer a candidate iff one component improves by >= ${String(IMPROVE * 100)}% and ` +
    `none worsens by more than ${String(WORSEN * 100)}%\n`,
);

// **Chain rows first** — FC-L6's clause, and the order is the point: it is the reference's own
// shape and D5's worst candidate, so it is measured before anything that might make it look
// unnecessary.
const ordered = [
  ...candidates.filter((c) => c.name.toLowerCase().includes('chain')),
  ...candidates.filter((c) => !c.name.toLowerCase().includes('chain')),
];
if (ordered.length !== candidates.length) throw new Error('candidate reordering lost a candidate');

const base = readVector(asap, shipped);
const rows = [base];
for (const candidate of ordered) {
  rows.push(
    readVector(asap, { name: candidate.name, laneOf: candidate.laneOf, lanes: candidate.lanes }),
  );
}

// The control FIRST: an unequal link population means the framing is culling one of them and every
// comparison below is between different questions (ADR-0130).
for (const row of rows) {
  if (row.visibleLinks !== base.visibleLinks) {
    throw new Error(
      `M4 INDETERMINATE: "${row.name}" carries ${String(row.visibleLinks)} links against the ` +
        `baseline's ${String(base.visibleLinks)}. The framing is culling one of them. Refusing to judge.`,
    );
  }
}
console.log(`  CONTROL PASSES — every layout carries the same ${String(base.visibleLinks)} links.`);

// **Determinism**, which M4's testing requirements name and which is not a nicety for this
// candidate: a lane that varies between presses of the same button is worse than a route that
// varies between frames (ADR-0065's argument, one axis over). Built twice from scratch and
// compared on the fingerprint of every drawn polyline, not on the lane map — the map is the input
// to the thing a planner sees, and it is the picture that has to be stable.
{
  const again = assignmentCandidates(FIXTURE);
  for (const [i, c] of again.candidates.entries()) {
    const repeat = readVector(asap, { name: c.name, laneOf: c.laneOf, lanes: c.lanes });
    const first = rows[1 + ordered.findIndex((o) => o.name === c.name)];
    if (repeat.fingerprint !== first.fingerprint) {
      throw new Error(
        `M4 INDETERMINATE: "${c.name}" (candidate ${String(i)}) painted a different picture on a ` +
          'second build from the same fixture. A candidate that is not deterministic cannot be ' +
          'offered, whatever it measures. Refusing to judge.',
      );
    }
  }
  console.log('  CONTROL PASSES — every candidate is deterministic across two independent builds.');
}

// **The structural claim, asserted rather than inherited.** `cheap-levers.md` argues that lane
// re-indexing cannot change the row count, because lanes are independent time-partitions and
// permuting their labels cannot make two bars overlap. That argument is the reason the candidate is
// cheap, so it is checked here rather than quoted.
{
  const d = rows.find((r) => r.name.startsWith('D '));
  if (d && d.lanes !== base.lanes) {
    throw new Error(
      `M4 INDETERMINATE: lane re-indexing reported ${String(d.lanes)} rows against the shipped ` +
        `${String(base.lanes)}. A relabelling cannot change the row count, so either the candidate ` +
        'is not a relabelling or the reading is wrong. Refusing to judge.',
    );
  }
  if (d)
    console.log(
      '  CONTROL PASSES — lane re-indexing is a relabelling: the row count is unchanged.',
    );
}
console.log('');

const pct = (now, then) => (then === 0 ? 0 : (now - then) / then);
const signed = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

console.log(
  `    ${'assignment'.padEnd(26)} ${'rows'.padStart(5)} ${'occl/link'.padStart(9)} ` +
    `${'x/link'.padStart(7)} ${'|Δlane|'.padStart(8)} ${'>5'.padStart(4)} ${'fingerprint'.padStart(12)}`,
);
for (const r of rows) {
  console.log(
    `    ${r.name.padEnd(26)} ${String(r.lanes).padStart(5)} ` +
      `${r.occlPerLink.toFixed(3).padStart(9)} ${r.perLink.toFixed(3).padStart(7)} ` +
      `${r.meanDelta.toFixed(3).padStart(8)} ${String(r.overFive).padStart(4)} ` +
      `${r.fingerprint.padStart(12)}`,
  );
}

console.log('\n  Against the shipped packing — the three components FC-L6 judges\n');
const verdicts = [];
for (const r of rows.slice(1)) {
  // Lower is better on all three, so a NEGATIVE delta is an improvement.
  const d = {
    occl: pct(r.occlPerLink, base.occlPerLink),
    x: pct(r.perLink, base.perLink),
    travel: pct(r.meanDelta, base.meanDelta),
  };
  const improves = Math.min(d.occl, d.x, d.travel) <= -IMPROVE;
  const worsens = Math.max(d.occl, d.x, d.travel) > WORSEN;
  const verdict =
    improves && !worsens
      ? 'OFFER'
      : improves
        ? 'blocked by a >10% regression'
        : 'no component reaches -20%';
  verdicts.push({ name: r.name, offer: improves && !worsens });
  console.log(
    `    ${r.name.padEnd(26)} occl ${signed(d.occl).padStart(7)}  ` +
      `x ${signed(d.x).padStart(7)}  travel ${signed(d.travel).padStart(7)}  ` +
      `rows ${signed(pct(r.lanes, base.lanes)).padStart(7)}  ->  ${verdict}`,
  );
}

console.log(
  '\n  H1 vs H2 — the decomposition FC-L6 demands, because the aggregate cannot separate them\n',
);
console.log(
  `    ${'assignment'.padEnd(26)} ${'same-row'.padStart(9)} ${'occl'.padStart(6)} ` +
    `${'rate'.padStart(6)} ${'cross-row'.padStart(10)} ${'occl'.padStart(6)} ${'rate'.padStart(6)} ` +
    `${'by lane'.padStart(8)}`,
);
for (const r of rows) {
  const rate = (g) => (g.links === 0 ? '—' : (g.foreignLinks / g.links).toFixed(3));
  console.log(
    `    ${r.name.padEnd(26)} ${String(r.sameRow.links).padStart(9)} ` +
      `${String(r.sameRow.foreignLinks).padStart(6)} ${rate(r.sameRow).padStart(6)} ` +
      `${String(r.crossRow.links).padStart(10)} ${String(r.crossRow.foreignLinks).padStart(6)} ` +
      `${rate(r.crossRow).padStart(6)} ${String(r.sameRowByLane).padStart(8)}`,
  );
}

// **The independent control on the split.** The geometric classifier reads the drawn polyline; this
// reads the layout. They share no code, so agreement is evidence and disagreement is a defect in
// one of them — which matters here because the first run reported chain rows and the shipped
// packing with an identical 68/120 split, which is the exact shape of a classifier that cannot see
// the candidate at all.
for (const r of rows) {
  if (r.sameRow.links !== r.sameRowByLane) {
    console.log(
      `\n  NOTE: "${r.name}" — the drawn split says ${String(r.sameRow.links)} same-row links and ` +
        `the layout says ${String(r.sameRowByLane)}. Read the difference before trusting either.`,
    );
  }
}

const offers = verdicts.filter((v) => v.offer);
if (offers.length > 0) {
  console.log(
    `\n  FC-L6 PASSES for ${offers.map((o) => o.name).join(', ')} — goes to the product owner ` +
      'with the NetPoint image beside the rendered candidate.',
  );
} else {
  console.log(
    '\n  FC-L6 FAILS for every candidate, and the withdrawal clause fires: M4 is WITHDRAWN and\n' +
      '  recorded as measured-and-rejected, with all four rules re-reported on their vector rows\n' +
      '  so the next reader does not re-derive them a third time.',
  );
  process.exitCode = 1;
}
