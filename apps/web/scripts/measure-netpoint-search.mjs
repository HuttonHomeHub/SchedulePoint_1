#!/usr/bin/env node
/**
 * **NetPoint-layout M0-T4 — the prototype search, and the CQ-1 frontier (FC-N10).**
 *
 *   PART=control|small|unit|scale node scripts/measure-netpoint-search.mjs
 *
 * Pitch 60, 4 px/day (the reference zoom). Each PART prints one JSON line per run to stdout after a
 * human table, so the write-up quotes the run rather than a transcription.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const PART = process.env.PART ?? 'control';
const out = mkdtempSync(join(tmpdir(), 'sp-netpoint-search-'));
const file = join(out, 'search.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/netpoint-search.ts',
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
const PITCH = Number(process.env.PITCH ?? 60);
writeFileSync(file, src.replace(/\bvar LANE_HEIGHT = \d+;/, `var LANE_HEIGHT = ${String(PITCH)};`));
const m = await import(pathToFileURL(file).href);

const rowsOf = (laneOf) => Math.max(...laneOf.values()) + 1;
/** The approved CQ-1 formula at +50 %; the other fractions follow ceil(k × seed). */
const budgets = (seed) => [
  ['seed', seed],
  ['+25%', seed + Math.ceil(0.25 * seed)],
  ['+50%', seed + Math.max(4, Math.ceil(0.5 * seed))],
  ['+100%', seed + seed],
  ['∞', 100_000],
];
const vec = (o) => `${o.overlaps}/${o.occluded}/${o.crossings}/${o.sameRow}/${o.travel}/${o.rows}`;
const lex = (a, b) => {
  const va = [a.overlaps, a.occluded, a.crossings, -a.sameRow, a.travel, a.rows];
  const vb = [b.overlaps, b.occluded, b.crossings, -b.sameRow, b.travel, b.rows];
  for (let i = 0; i < 6; i += 1) if (va[i] !== vb[i]) return va[i] < vb[i] ? -1 : 1;
  return 0;
};

const unit = () => m.unit300Layouts(FIXTURE, { rollUpSummaries: true });
console.log(
  `\n[NetPoint-layout M0-T4 ${PART}] ${new Date().toISOString()}, commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim().slice(0, 8)}, pitch 60, 4 px/day\n`,
);

function run(label, asap, layout, budget, mode, extra = {}) {
  const r = m.search(asap, layout, { budget, mode, ...extra });
  const worse = lex(r.final, r.repaired) > 0 || (r.seed.overlaps === 0 && lex(r.final, r.seed) > 0);
  const row = {
    label,
    mode,
    budget,
    seedRows: rowsOf(layout.laneOf),
    seed: vec(r.seed),
    repaired: vec(r.repaired),
    final: vec(r.final),
    passes: r.passes,
    filterEvals: r.filterEvals,
    fullEvals: r.fullEvals,
    accepted: r.accepted,
    compactionSideEffects: r.compactionSideEffects,
    ms: Math.round(r.ms),
    worse,
  };
  console.log(
    `${label.padEnd(34)} ${mode.padEnd(8)} B=${String(budget).padStart(6)}  seed ${row.seed.padEnd(26)} → ${row.final.padEnd(26)} passes ${r.passes} full ${r.fullEvals} filter ${r.filterEvals} ${row.ms} ms${worse ? '  ** WORSE **' : ''}`,
  );
  console.log(`JSON ${JSON.stringify(row)}`);
  if (worse) throw new Error(`NEVER-WORSE VIOLATED: ${label}`);
  return { r, row };
}

if (PART === 'control') {
  // The fast counters must equal the naive ones before any search result is trusted.
  const chain = m.chainPlacedLayouts();
  const small = m.smallPlanLayouts();
  const u = unit();
  const s500 = m.scalePlan(500);
  const s2000 = m.scalePlan(2000);
  const cases = [
    ['chain prefix', chain.asap, chain.prefix],
    ['chain packed', chain.asap, chain.shipped],
    ['small-17', small.asap, small.shipped],
    ['Unit 300', u.asap, u.shipped],
    ['scale-500 generator', s500.asap, s500.generator],
    ['scale-2000 generator', s2000.asap, s2000.generator],
    ['scale-2000 packed', s2000.asap, m.packedOnDrawn(s2000.asap, 'p')],
  ];
  for (const [name, asap, layout] of cases) {
    m.setCounters('naive');
    const naive = m.evaluateFull(asap, layout).objective;
    m.setCounters('fast');
    const fast = m.evaluateFull(asap, layout).objective;
    const same = m.objectiveKey(naive) === m.objectiveKey(fast);
    console.log(
      `${name.padEnd(22)} naive ${vec(naive).padEnd(28)} fast ${vec(fast).padEnd(28)} ${same ? 'EQUAL' : 'DIFFER'}`,
    );
    if (!same) throw new Error(`INDETERMINATE: fast counters differ on ${name}`);
  }
} else if (PART === 'identity') {
  // M0-T4 finding: both attributions, per plan and zoom, and whether each survives reversed input.
  m.setCounters('fast');
  const chain = m.chainPlacedLayouts();
  const small = m.smallPlanLayouts();
  const u = unit();
  const s2000 = m.scalePlan(2000);
  const cases = [
    ['chain-3 packed', chain.asap, chain.shipped],
    ['small-17', small.asap, small.shipped],
    ['Unit 300', u.asap, u.shipped],
    ['scale-2000 packed', s2000.asap, m.packedOnDrawn(s2000.asap, 'p')],
  ];
  console.log(
    `pitch ${String(PITCH)}: plan, px/day, position (fixture / reversed), identity (fixture / reversed)`,
  );
  for (const [name, asap, layout] of cases) {
    const reversed = { ...asap, activities: [...asap.activities].reverse() };
    for (const pxPerDay of [1, 4, 12]) {
      const read = (mode, a) => {
        m.setAttribution(mode);
        return m.evaluateFull(a, layout, pxPerDay).objective.occluded;
      };
      const row = {
        plan: name,
        pxPerDay,
        position: [read('position', asap), read('position', reversed)],
        identity: [read('identity', asap), read('identity', reversed)],
      };
      console.log(
        `${name.padEnd(18)} ${String(pxPerDay).padStart(3)}  position ${String(row.position[0]).padStart(5)} / ${String(row.position[1]).padStart(5)}   identity ${String(row.identity[0]).padStart(5)} / ${String(row.identity[1]).padStart(5)}`,
      );
      console.log(`JSON ${JSON.stringify(row)}`);
      if (row.identity[0] !== row.identity[1])
        throw new Error(`identity attribution is order-dependent on ${name}`);
    }
  }
} else if (PART === 'small') {
  const chain = m.chainPlacedLayouts();
  const small = m.smallPlanLayouts();
  const B = (seed) => budgets(seed)[2][1];
  run(
    'chain-3 Tidy (pre-fix seed)',
    chain.asap,
    chain.prefix,
    B(rowsOf(chain.prefix.laneOf)),
    'exact',
  );
  run(
    'chain-3 Re-layout (packed seed)',
    chain.asap,
    chain.shipped,
    B(rowsOf(chain.shipped.laneOf)),
    'exact',
  );
  run('small-17 Re-layout', small.asap, small.shipped, B(rowsOf(small.shipped.laneOf)), 'exact');
  run('small-17 Re-layout ∞', small.asap, small.shipped, 100_000, 'exact');
} else if (PART === 'unit') {
  const u = unit();
  const seed = rowsOf(u.shipped.laneOf);
  for (const mode of (process.env.MODES ?? 'exact,filtered').split(',')) {
    for (const [name, b] of budgets(seed))
      run(`Unit 300 Re-layout ${name}`, u.asap, u.shipped, b, mode);
  }
} else if (PART === 'determinism') {
  const u = unit();
  const B = budgets(rowsOf(u.shipped.laneOf))[2][1];
  const a = run('Unit 300 +50% (1)', u.asap, u.shipped, B, 'filtered').r;
  const b = run('Unit 300 +50% (2)', u.asap, u.shipped, B, 'filtered').r;
  const permuted = {
    ...u.asap,
    activities: [...u.asap.activities].reverse(),
    dependencies: [...u.asap.dependencies].reverse(),
  };
  const c = run('Unit 300 +50% (permuted input)', permuted, u.shipped, B, 'filtered').r;
  const key = (r) =>
    [...r.laneOf]
      .sort()
      .map(([k, l]) => `${k}:${l}`)
      .join(',');
  console.log(
    `two runs identical: ${key(a) === key(b)}; permuted input identical: ${key(a) === key(c)}`,
  );
} else if (PART === 'scale') {
  const s = m.scalePlan(2000);
  const packed = m.packedOnDrawn(s.asap, 'scale-2000 packed');
  const which = (process.env.BUDGETS ?? 'seed,+25%,+50%,+100%,∞').split(',');
  for (const [name, b] of budgets(rowsOf(packed.laneOf))) {
    if (which.includes(name))
      run(`scale-2000 Re-layout ${name}`, s.asap, packed, b, 'filtered', {
        passes: Number(process.env.PASSES ?? 8),
      });
  }
  if (process.env.TIDY === '1') {
    const B = budgets(rowsOf(s.generator.laneOf))[2][1];
    run('scale-2000 Tidy (generator seed) +50%', s.asap, s.generator, B, 'filtered', {
      passes: Number(process.env.PASSES ?? 8),
    });
  }
}
